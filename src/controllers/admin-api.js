import { MD5MD5 } from '../utils/helpers.js';
import { isTrustedRequestOrigin, revokeAllSessions } from './auth.js';
import { apiSecurityHeaders } from '../ui/assets.js';
import { renderQrSvg } from '../ui/qr.js';
import {
    buildNativeExportUrls,
    createNativeNodes,
    normalizePreferredTarget,
    resolveTunnelPath,
} from '../subscriptions/native.js';

const PREFERRED_IPS_KEY = 'preferred-ips.json';
const MAX_PREFERRED_IPS = 128;
const ALLOWED_TRANSPORTS = new Set(['ws', 'xhttp', 'grpc']);
const ALLOWED_FINGERPRINTS = new Set(['chrome', 'firefox', 'safari', 'random']);

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: apiSecurityHeaders() });
}

function errorResponse(error, status = 400) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : String(error) }, status);
}

async function readJsonBody(request, maxBytes = 64 * 1024) {
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > maxBytes) throw new Error('Request body is too large');
    const text = await request.text();
    if (text.length > maxBytes) throw new Error('Request body is too large');
    if (!text.trim()) return {};
    try {
        return JSON.parse(text);
    } catch {
        throw new Error('Request body must be valid JSON');
    }
}

function safeJson(value, fallback) {
    try {
        const parsed = JSON.parse(value);
        return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
        return fallback;
    }
}

function cleanText(value, maxLength = 128) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function maskUuid(value) {
    const uuid = String(value || '').replace(/^\uFEFF+/, '');
    return uuid.length > 13 ? `${uuid.slice(0, 8)}-••••-••••-••••-${uuid.slice(-4)}` : '••••••••';
}

function sanitizeLogUrl(value) {
    try {
        const url = new URL(value);
        for (const key of ['token', 'password', 'authorization', 'auth', 'key', 'apikey', 'api_key']) url.searchParams.delete(key);
        return `${url.pathname}${url.search}`;
    } catch {
        return '/';
    }
}

function mapLog(log) {
    return {
        type: cleanText(log?.TYPE || 'Unknown', 32),
        ip: cleanText(log?.IP || 'Unknown', 64),
        asn: cleanText(log?.ASN || 'Unknown', 128),
        country: cleanText(log?.CC || 'Unknown', 128),
        url: sanitizeLogUrl(log?.URL || '/'),
        ua: cleanText(log?.UA || 'Unknown', 512),
        time: Number(log?.TIME || 0),
    };
}

function normalizeStoredEntry(input, existing = null) {
    const target = normalizePreferredTarget(input, { required: true });
    const latencyValue = input.latency === '' || input.latency === null || input.latency === undefined
        ? null
        : Number(String(input.latency).replace(/ms$/i, '').trim());
    const latency = Number.isFinite(latencyValue) && latencyValue >= 0 && latencyValue <= 60000
        ? Math.round(latencyValue)
        : null;
    const now = new Date().toISOString();
    const id = /^[a-z0-9-]{8,80}$/i.test(String(input.id || '')) ? String(input.id) : crypto.randomUUID();
    return {
        id,
        address: target.address,
        port: target.port,
        label: cleanText(target.label, 64),
        latency,
        source: cleanText(input.source || existing?.source || 'local-scan', 48),
        notes: cleanText(input.notes || existing?.notes || '', 256),
        createdAt: existing?.createdAt || input.createdAt || now,
        updatedAt: now,
    };
}

function parseImportLine(line) {
    let value = String(line || '').trim();
    if (!value || value.startsWith('#')) return null;

    let latency = null;
    const latencyMatch = value.match(/,\s*(\d+(?:\.\d+)?)\s*ms?\s*$/i);
    if (latencyMatch) {
        latency = Number(latencyMatch[1]);
        value = value.slice(0, latencyMatch.index).trim();
    }

    let label = '';
    const hashIndex = value.indexOf('#');
    if (hashIndex !== -1) {
        label = value.slice(hashIndex + 1).trim();
        value = value.slice(0, hashIndex).trim();
    }

    let address = value;
    let port = 443;
    const bracketed = value.match(/^\[([^\]]+)](?::(\d+))?$/);
    if (bracketed) {
        address = bracketed[1];
        port = bracketed[2] ? Number(bracketed[2]) : 443;
    } else {
        const ipv4WithPort = value.match(/^((?:\d{1,3}\.){3}\d{1,3})(?::(\d+))?$/);
        if (ipv4WithPort) {
            address = ipv4WithPort[1];
            port = ipv4WithPort[2] ? Number(ipv4WithPort[2]) : 443;
        }
    }

    return { address, port, label: label || address, latency, source: 'local-scan' };
}

async function readPreferredIps(env) {
    const stored = safeJson(await env.KV.get(PREFERRED_IPS_KEY), []);
    if (!Array.isArray(stored)) return [];
    const entries = [];
    for (const input of stored.slice(0, MAX_PREFERRED_IPS)) {
        try { entries.push(normalizeStoredEntry(input, input)); } catch { }
    }
    return entries;
}

async function writePreferredIps(env, body) {
    const byAddress = new Map();
    const supplied = Array.isArray(body.entries) ? body.entries : [];
    for (const input of supplied.slice(0, MAX_PREFERRED_IPS)) {
        try {
            const entry = normalizeStoredEntry(input, input);
            byAddress.set(`${entry.address}:${entry.port}`, entry);
        } catch { }
    }

    if (typeof body.importText === 'string') {
        for (const line of body.importText.split(/\r?\n/).slice(0, MAX_PREFERRED_IPS)) {
            const input = parseImportLine(line);
            if (!input) continue;
            try {
                const keyTarget = normalizePreferredTarget(input, { required: true });
                const key = `${keyTarget.address}:${keyTarget.port}`;
                const entry = normalizeStoredEntry(input, byAddress.get(key));
                byAddress.set(key, entry);
            } catch { }
        }
    }

    const entries = [...byAddress.values()].slice(0, MAX_PREFERRED_IPS);
    await env.KV.put(PREFERRED_IPS_KEY, JSON.stringify(entries, null, 2));
    return entries;
}

async function readIntegrationState(env, config) {
    const cf = safeJson(await env.KV.get('cf.json'), {});
    const tg = safeJson(await env.KV.get('tg.json'), {});
    const cloudflareMode = cf.UsageAPI ? 'usage' : cf.AccountID && cf.APIToken ? 'token' : cf.Email && cf.GlobalAPIKey ? 'global' : 'none';
    return {
        cloudflare: {
            configured: cloudflareMode !== 'none',
            mode: cloudflareMode,
            usage: config.CF?.Usage || { success: false, pages: 0, workers: 0, total: 0, max: 100000 },
        },
        telegram: {
            configured: Boolean(tg.BotToken && tg.ChatID),
            enabled: Boolean(config.TG?.['启用'] && tg.BotToken && tg.ChatID),
        },
    };
}

function settingsView(config, env) {
    return {
        subscriptionName: cleanText(config['优选订阅生成']?.SUBNAME || 'edgetunnel', 64),
        tunnelPath: resolveTunnelPath(config, env),
        pathLocked: Boolean(env.PATH),
        fingerprint: ALLOWED_FINGERPRINTS.has(String(config.Fingerprint).toLowerCase()) ? String(config.Fingerprint).toLowerCase() : 'chrome',
        updateInterval: Math.min(168, Math.max(1, Number(config['优选订阅生成']?.SUBUpdateTime || 3))),
        transports: [...new Set((Array.isArray(config.TRANSPORTS) ? config.TRANSPORTS : ['ws', 'xhttp', 'grpc']).filter((value) => ALLOWED_TRANSPORTS.has(value)))],
        shadowsocks: config.SHADOWSOCKS?.enabled !== false,
        zeroRtt: Boolean(config['启用0RTT']),
        skipCertificateVerification: Boolean(config['跳过证书验证']),
    };
}

function previewPayload(config, env, origin, token, preferredTarget = null) {
    const nodes = createNativeNodes(config, env, preferredTarget);
    return {
        serviceHost: config.HOST,
        server: preferredTarget || { address: config.HOST, port: 443, label: config['优选订阅生成']?.SUBNAME || 'edgetunnel' },
        urls: buildNativeExportUrls(origin, token, preferredTarget),
        nodes: nodes.map((node) => ({
            name: node.name,
            type: node.type,
            network: node.network || 'ws',
            server: node.server,
            port: node.port,
            shareLink: node.shareLink,
        })),
    };
}

async function bootstrap(request, env, config) {
    const url = new URL(request.url);
    const token = await MD5MD5(config.HOST + config.UUID);
    const preferredIps = await readPreferredIps(env);
    const rawLogs = safeJson(await env.KV.get('log.json'), []);
    const logs = (Array.isArray(rawLogs) ? rawLogs : []).slice(-200).reverse().map(mapLog);
    const preview = previewPayload(config, env, url.origin, token);
    const matrix = preview.nodes.map((node) => ({
        name: node.type === 'ss' ? 'Shadowsocks' : node.type.toUpperCase(),
        transport: node.network.toUpperCase(),
    }));
    return {
        version: 1,
        service: {
            host: config.HOST,
            tunnelPath: resolveTunnelPath(config, env),
            maskedUuid: maskUuid(config.UUID),
            transports: settingsView(config, env).transports,
            protocolMatrix: matrix,
        },
        settings: settingsView(config, env),
        preferredIps,
        logs,
        exports: preview.urls,
        stats: {
            nodeCount: preview.nodes.length,
            subscriptionRequests: logs.filter((log) => log.type === 'Get_SUB').length,
        },
        integrations: await readIntegrationState(env, config),
        request: {
            colo: request.cf?.colo || null,
            country: request.cf?.country || null,
            city: request.cf?.city || null,
        },
    };
}

async function applySettings(env, config, body) {
    const subscriptionName = cleanText(body.subscriptionName, 64);
    if (!subscriptionName) throw new Error('Subscription name is required');
    const tunnelPath = String(body.tunnelPath || '').trim();
    if (!tunnelPath.startsWith('/') || tunnelPath.length > 256 || /[\r\n\0\s]/.test(tunnelPath)) throw new Error('Tunnel path must start with / and contain no whitespace');
    const transports = [...new Set(Array.isArray(body.transports) ? body.transports.map((value) => String(value).toLowerCase()) : [])];
    if (!transports.length || transports.some((value) => !ALLOWED_TRANSPORTS.has(value))) throw new Error('Select at least one supported transport');
    const fingerprint = String(body.fingerprint || '').toLowerCase();
    if (!ALLOWED_FINGERPRINTS.has(fingerprint)) throw new Error('Unsupported TLS fingerprint');
    const updateInterval = Number(body.updateInterval);
    if (!Number.isInteger(updateInterval) || updateInterval < 1 || updateInterval > 168) throw new Error('Update interval must be between 1 and 168 hours');

    const persistedValue = await env.KV.get('config.json');
    const persisted = persistedValue ? safeJson(persistedValue, structuredClone(config)) : structuredClone(config);
    persisted.TUNNEL_PATH = tunnelPath;
    persisted.TRANSPORTS = transports;
    persisted.Fingerprint = fingerprint;
    persisted['启用0RTT'] = Boolean(body.zeroRtt);
    persisted['跳过证书验证'] = Boolean(body.skipCertificateVerification);
    persisted.SHADOWSOCKS = {
        ...(persisted.SHADOWSOCKS || {}),
        enabled: Boolean(body.shadowsocks),
        method: ['aes-128-gcm', 'aes-256-gcm'].includes(persisted.SHADOWSOCKS?.method) ? persisted.SHADOWSOCKS.method : 'aes-128-gcm',
        tls: persisted.SHADOWSOCKS?.tls !== false,
    };
    persisted['优选订阅生成'] = {
        ...(persisted['优选订阅生成'] || {}),
        SUBNAME: subscriptionName,
        SUBUpdateTime: updateInterval,
    };
    await env.KV.put('config.json', JSON.stringify(persisted, null, 2));
    return { success: true };
}

async function saveSettings(request, env, config) {
    return applySettings(env, config, await readJsonBody(request));
}

async function createBackup(env, config) {
    return {
        schema: 're-edgetunnel-ui-backup-v1',
        exportedAt: new Date().toISOString(),
        serviceHost: config.HOST,
        settings: settingsView(config, env),
        preferredIps: await readPreferredIps(env),
        note: 'ADMIN, UUID, subscription tokens and integration secrets are intentionally excluded.',
    };
}

async function restoreBackup(request, env, config) {
    const body = await readJsonBody(request, 256 * 1024);
    const backup = body.backup && typeof body.backup === 'object' ? body.backup : body;
    if (backup.schema !== 're-edgetunnel-ui-backup-v1' || !backup.settings || !Array.isArray(backup.preferredIps)) {
        throw new Error('Unsupported or incomplete backup file');
    }
    await applySettings(env, config, backup.settings);
    const entries = await writePreferredIps(env, { entries: backup.preferredIps });
    return { success: true, preferredIpCount: entries.length };
}

async function saveCloudflareIntegration(request, env) {
    const body = await readJsonBody(request);
    const mode = String(body.mode || 'none');
    const current = safeJson(await env.KV.get('cf.json'), {});
    let next = { Email: null, GlobalAPIKey: null, AccountID: null, APIToken: null, UsageAPI: null };
    if (mode === 'token') {
        const accountId = cleanText(body.identity || current.AccountID, 64);
        const token = String(body.secret || current.APIToken || '').trim();
        if (!/^[a-f0-9]{32}$/i.test(accountId) || token.length < 20 || token.length > 512 || /\s/.test(token)) throw new Error('Valid Account ID and API Token are required');
        next = { ...next, AccountID: accountId, APIToken: token };
    } else if (mode === 'global') {
        const email = cleanText(body.identity || current.Email, 254);
        const key = String(body.secret || current.GlobalAPIKey || '').trim();
        if (!/^\S+@\S+\.\S+$/.test(email) || key.length < 20 || key.length > 512 || /\s/.test(key)) throw new Error('Valid email and Global API Key are required');
        next = { ...next, Email: email, GlobalAPIKey: key };
    } else if (mode === 'usage') {
        const usageApi = new URL(String(body.identity || current.UsageAPI || ''));
        if (usageApi.protocol !== 'https:' || usageApi.username || usageApi.password) throw new Error('Usage API must be an HTTPS URL without embedded credentials');
        next = { ...next, UsageAPI: usageApi.href };
    } else if (mode !== 'none') {
        throw new Error('Unsupported Cloudflare integration mode');
    }
    await env.KV.put('cf.json', JSON.stringify(next, null, 2));
    return { success: true, mode };
}

async function saveTelegramIntegration(request, env, config) {
    const body = await readJsonBody(request);
    const current = safeJson(await env.KV.get('tg.json'), {});
    const enabled = Boolean(body.enabled);
    const botToken = String(body.botToken || current.BotToken || '').trim();
    const chatId = String(body.chatId || current.ChatID || '').trim();
    if (enabled && (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(botToken) || !/^-?\d{4,}$/.test(chatId))) throw new Error('Valid Bot Token and Chat ID are required when Telegram is enabled');
    await env.KV.put('tg.json', JSON.stringify({ BotToken: botToken || null, ChatID: chatId || null }, null, 2));
    const persistedValue = await env.KV.get('config.json');
    const persisted = persistedValue ? safeJson(persistedValue, structuredClone(config)) : structuredClone(config);
    persisted.TG = { ...(persisted.TG || {}), ['启用']: enabled };
    await env.KV.put('config.json', JSON.stringify(persisted, null, 2));
    return { success: true, enabled };
}

export async function handleAdminApi(request, env, config, path, dependencies = {}) {
    const mutation = request.method !== 'GET' && request.method !== 'HEAD';
    if (mutation && !isTrustedRequestOrigin(request)) return errorResponse('Forbidden', 403);

    try {
        const url = new URL(request.url);
        if (path === 'admin/api/bootstrap' && request.method === 'GET') return jsonResponse(await bootstrap(request, env, config));
        if (path === 'admin/api/preview' && request.method === 'GET') {
            const token = await MD5MD5(config.HOST + config.UUID);
            const preferred = url.searchParams.has('ip')
                ? normalizePreferredTarget({ ip: url.searchParams.get('ip'), port: url.searchParams.get('port'), label: url.searchParams.get('name') }, { required: true })
                : null;
            return jsonResponse(previewPayload(config, env, url.origin, token, preferred));
        }
        if (path === 'admin/api/settings' && request.method === 'POST') return jsonResponse(await saveSettings(request, env, config));
        if (path === 'admin/api/backup' && request.method === 'GET') {
            const backup = await createBackup(env, config);
            return new Response(JSON.stringify(backup, null, 2), {
                status: 200,
                headers: {
                    ...apiSecurityHeaders(),
                    'Content-Disposition': 'attachment; filename="re-edgetunnel-backup.json"',
                },
            });
        }
        if (path === 'admin/api/restore' && request.method === 'POST') return jsonResponse(await restoreBackup(request, env, config));
        if (path === 'admin/api/reset' && request.method === 'POST') {
            const defaults = {
                subscriptionName: 'edgetunnel',
                tunnelPath: '/tunnel',
                fingerprint: 'chrome',
                updateInterval: 3,
                transports: ['ws', 'xhttp', 'grpc'],
                shadowsocks: true,
                zeroRtt: false,
                skipCertificateVerification: false,
            };
            await applySettings(env, config, defaults);
            return jsonResponse({ success: true, settings: { ...defaults, pathLocked: Boolean(env.PATH) } });
        }
        if (path === 'admin/api/preferred-ips' && request.method === 'POST') {
            const entries = await writePreferredIps(env, await readJsonBody(request, 256 * 1024));
            return jsonResponse({ success: true, entries });
        }
        if (path === 'admin/api/logs/clear' && request.method === 'POST') {
            await env.KV.put('log.json', '[]');
            return jsonResponse({ success: true });
        }
        if (path === 'admin/api/integrations/cloudflare' && request.method === 'POST') return jsonResponse(await saveCloudflareIntegration(request, env));
        if (path === 'admin/api/integrations/telegram' && request.method === 'POST') return jsonResponse(await saveTelegramIntegration(request, env, config));
        if (path === 'admin/api/proxy-check' && request.method === 'POST') {
            if (!dependencies.getProxyCheckTarget || !dependencies.checkProxyConnection) return errorResponse('Proxy diagnostics are unavailable', 503);
            const target = dependencies.getProxyCheckTarget(env);
            if (!target) return errorResponse('Configure an operator-owned PROXY_CHECK_HOST before testing an upstream proxy', 503);
            const body = await readJsonBody(request);
            return jsonResponse(await dependencies.checkProxyConnection(String(body.type || ''), String(body.value || ''), target));
        }
        if (path === 'admin/api/qr' && request.method === 'POST') {
            const body = await readJsonBody(request, 8 * 1024);
            return jsonResponse({ svg: renderQrSvg(body.text) });
        }
        if (path === 'admin/api/sessions/revoke' && request.method === 'POST') {
            return jsonResponse({ success: true, revoked: await revokeAllSessions(env) });
        }
        return errorResponse('Not found', 404);
    } catch (error) {
        return errorResponse(error, error instanceof URIError ? 400 : 400);
    }
}
