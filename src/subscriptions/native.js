import { buildProxyUri, buildShadowsocksUri, normalizeTransport } from '../utils/helpers.js';

const ALLOWED_TRANSPORTS = new Set(['ws', 'xhttp', 'grpc']);
const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function yamlQuote(value) {
    return JSON.stringify(String(value));
}

function cleanLabel(value, fallback = 'edgetunnel') {
    const label = String(value || '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 64);
    return label || fallback;
}

function isValidIPv4(value) {
    if (!IPV4_PATTERN.test(value)) return false;
    return value.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);
}

function isValidIPv6(value) {
    if (!value.includes(':') || /[^0-9a-f:]/i.test(value)) return false;
    try {
        const parsed = new URL(`https://[${value}]/`);
        return parsed.hostname.includes(':');
    } catch {
        return false;
    }
}

export function normalizePreferredTarget(input, { required = false } = {}) {
    if (!input || (!input.address && !input.ip)) {
        if (required) throw new Error('Preferred IP is required');
        return null;
    }

    const rawAddress = String(input.address || input.ip || '').trim();
    const address = rawAddress.startsWith('[') && rawAddress.endsWith(']')
        ? rawAddress.slice(1, -1)
        : rawAddress;
    if (!isValidIPv4(address) && !isValidIPv6(address)) {
        throw new Error('Preferred address must be a valid IPv4 or IPv6 address');
    }

    const port = input.port === undefined || input.port === null || input.port === ''
        ? 443
        : Number(input.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Preferred port must be an integer between 1 and 65535');
    }

    return {
        address: address.toLowerCase(),
        port,
        label: cleanLabel(input.label || input.name || address, address),
    };
}

export function preferredTargetFromUrl(url) {
    const ip = url.searchParams.get('ip');
    if (!ip) return null;
    return normalizePreferredTarget({
        ip,
        port: url.searchParams.get('port') || 443,
        label: url.searchParams.get('name') || ip,
    }, { required: true });
}

export function resolveTunnelPath(config, env = {}) {
    const rawPath = env.PATH || config.TUNNEL_PATH || '/tunnel';
    const path = String(rawPath || '/tunnel').trim();
    if (!path.startsWith('/') || path.length > 256 || /[\r\n\0\s]/.test(path)) return '/tunnel';
    return path;
}

function normalizedTransports(config) {
    const source = Array.isArray(config.TRANSPORTS) ? config.TRANSPORTS : ['ws', 'xhttp', 'grpc'];
    const transports = [...new Set(source.map(normalizeTransport).filter((value) => ALLOWED_TRANSPORTS.has(value)))];
    return transports.length ? transports : ['ws'];
}

function subscriptionName(config) {
    return cleanLabel(config['优选订阅生成']?.SUBNAME, 'edgetunnel');
}

function baseNode({ name, type, server, port, host, credential, network, path, fingerprint, skipCertificateVerification }) {
    return {
        name,
        type,
        server,
        port,
        credential,
        uuid: type === 'vless' ? credential : undefined,
        password: type === 'trojan' ? credential : undefined,
        network,
        sni: host,
        host,
        path,
        fingerprint,
        skipCertificateVerification,
        grpcServiceName: path.replace(/^\/+/, '') || 'tunnel',
        xhttpMode: 'stream-one',
    };
}

export function createNativeNodes(config, env = {}, preferredTarget = null) {
    const host = String(config.HOST || '').trim().toLowerCase();
    const credential = String(config.UUID || '').trim().replace(/^\uFEFF+/, '');
    if (!host || !credential) throw new Error('Host and UUID are required to generate nodes');

    const target = preferredTarget ? normalizePreferredTarget(preferredTarget, { required: true }) : null;
    const server = target?.address || host;
    const port = target?.port || 443;
    const path = resolveTunnelPath(config, env);
    const fingerprint = cleanLabel(config.Fingerprint, 'chrome');
    const skipCertificateVerification = Boolean(config['跳过证书验证']);
    const prefix = cleanLabel(target?.label || subscriptionName(config));
    const transports = normalizedTransports(config);
    const nodes = [];

    for (const transport of transports) {
        const name = `${prefix}-vless-${transport}`;
        const node = baseNode({
            name,
            type: 'vless',
            server,
            port,
            host,
            credential,
            network: transport,
            path: transport === 'ws' && config['启用0RTT']
                ? `${path}${path.includes('?') ? '&' : '?'}ed=2560`
                : path,
            fingerprint,
            skipCertificateVerification,
        });
        node.shareLink = buildProxyUri({
            protocol: 'vless',
            credential,
            address: server,
            port,
            host,
            transport,
            path: node.path,
            fingerprint,
            name,
            skipCertificateVerification,
        });
        nodes.push(node);
    }

    for (const transport of transports.filter((value) => value !== 'xhttp')) {
        const name = `${prefix}-trojan-${transport}`;
        const node = baseNode({
            name,
            type: 'trojan',
            server,
            port,
            host,
            credential,
            network: transport,
            path,
            fingerprint,
            skipCertificateVerification,
        });
        node.shareLink = buildProxyUri({
            protocol: 'trojan',
            credential,
            address: server,
            port,
            host,
            transport,
            path,
            fingerprint,
            name,
            skipCertificateVerification,
        });
        nodes.push(node);
    }

    if (config.SHADOWSOCKS?.enabled !== false) {
        const method = ['aes-128-gcm', 'aes-256-gcm'].includes(String(config.SHADOWSOCKS?.method).toLowerCase())
            ? String(config.SHADOWSOCKS.method).toLowerCase()
            : 'aes-128-gcm';
        const name = `${prefix}-shadowsocks-ws`;
        nodes.push({
            name,
            type: 'ss',
            server,
            port,
            method,
            password: credential,
            host,
            path,
            tls: config.SHADOWSOCKS?.tls !== false,
            shareLink: buildShadowsocksUri({
                method,
                password: credential,
                address: server,
                port,
                host,
                path,
                name,
                tls: config.SHADOWSOCKS?.tls !== false,
            }),
        });
    }

    return nodes;
}

function appendVless(lines, node) {
    lines.push(
        `    uuid: ${yamlQuote(node.uuid)}`,
        '    udp: false',
        '    tls: true',
        `    servername: ${yamlQuote(node.sni)}`,
        `    client-fingerprint: ${yamlQuote(node.fingerprint)}`,
        `    skip-cert-verify: ${node.skipCertificateVerification ? 'true' : 'false'}`,
        '    encryption: ""',
        `    network: ${node.network}`,
    );
    if (node.network === 'ws') {
        lines.push('    ws-opts:', `      path: ${yamlQuote(node.path)}`, '      headers:', `        Host: ${yamlQuote(node.host)}`);
    } else if (node.network === 'xhttp') {
        lines.push('    xhttp-opts:', `      path: ${yamlQuote(node.path)}`, `      host: ${yamlQuote(node.host)}`, `      mode: ${yamlQuote(node.xhttpMode)}`);
    } else if (node.network === 'grpc') {
        lines.push('    grpc-opts:', `      grpc-service-name: ${yamlQuote(node.grpcServiceName)}`);
    }
}

function appendTrojan(lines, node) {
    lines.push(
        `    password: ${yamlQuote(node.password)}`,
        '    udp: false',
        `    sni: ${yamlQuote(node.sni)}`,
        `    client-fingerprint: ${yamlQuote(node.fingerprint)}`,
        `    skip-cert-verify: ${node.skipCertificateVerification ? 'true' : 'false'}`,
        `    network: ${node.network}`,
    );
    if (node.network === 'ws') {
        lines.push('    ws-opts:', `      path: ${yamlQuote(node.path)}`, '      headers:', `        Host: ${yamlQuote(node.host)}`);
    } else if (node.network === 'grpc') {
        lines.push('    grpc-opts:', `      grpc-service-name: ${yamlQuote(node.grpcServiceName)}`);
    }
}

function appendShadowsocks(lines, node) {
    const pluginPath = `${node.path}${node.path.includes('?') ? '&' : '?'}enc=${encodeURIComponent(node.method)}`;
    lines.push(
        `    cipher: ${yamlQuote(node.method)}`,
        `    password: ${yamlQuote(node.password)}`,
        '    udp: false',
        '    plugin: v2ray-plugin',
        '    plugin-opts:',
        '      mode: "websocket"',
        `      tls: ${node.tls ? 'true' : 'false'}`,
        '      mux: false',
        `      host: ${yamlQuote(node.host)}`,
        `      path: ${yamlQuote(pluginPath)}`,
    );
}

export function generateNativeClash(nodes) {
    if (!Array.isArray(nodes) || !nodes.length) throw new Error('At least one node is required');
    const lines = [
        '# Generated by Re_edgetunnel. Change only server when using a scanned Cloudflare IP.',
        '# Keep servername/sni, Host, UUID/password and tunnel path unchanged.',
        'mode: rule',
        '',
        'proxies:',
    ];

    for (const node of nodes) {
        lines.push(
            `  - name: ${yamlQuote(node.name)}`,
            `    type: ${node.type}`,
            `    server: ${yamlQuote(node.server)}`,
            `    port: ${node.port}`,
        );
        if (node.type === 'vless') appendVless(lines, node);
        else if (node.type === 'trojan') appendTrojan(lines, node);
        else if (node.type === 'ss') appendShadowsocks(lines, node);
    }

    lines.push('', 'proxy-groups:', '  - name: "PROXY"', '    type: select', '    proxies:');
    for (const node of nodes) lines.push(`      - ${yamlQuote(node.name)}`);
    lines.push('      - DIRECT', '', 'rules:', '  - GEOIP,LAN,DIRECT', '  - GEOIP,CN,DIRECT', '  - MATCH,PROXY');
    return `${lines.join('\n')}\n`;
}

export function generateNativeLinks(nodes) {
    if (!Array.isArray(nodes) || !nodes.length) throw new Error('At least one node is required');
    return `${nodes.map((node) => node.shareLink).join('\n')}\n`;
}

function addPreferredTarget(url, preferredTarget) {
    if (!preferredTarget) return;
    const target = normalizePreferredTarget(preferredTarget, { required: true });
    url.searchParams.set('ip', target.address);
    if (target.port !== 443) url.searchParams.set('port', String(target.port));
    if (target.label && target.label !== target.address) url.searchParams.set('name', target.label);
}

export function buildNativeExportUrls(origin, token, preferredTarget = null) {
    const makeUrl = (format) => {
        const url = new URL('/sub', origin);
        url.searchParams.set('token', token);
        url.searchParams.set('format', format);
        addPreferredTarget(url, preferredTarget);
        return url.href;
    };
    return {
        clash: makeUrl('clash'),
        links: makeUrl('links'),
    };
}

export function safeDownloadName(config, preferredTarget, extension) {
    const base = cleanLabel(preferredTarget?.label || subscriptionName(config))
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || 'edgetunnel';
    return `${base}.${extension}`;
}
