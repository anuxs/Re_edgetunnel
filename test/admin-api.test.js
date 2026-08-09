import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAdminApi } from '../src/controllers/admin-api.js';

class MemoryKV {
    constructor(values = {}) { this.values = new Map(Object.entries(values)); }
    async get(key) { return this.values.get(key) ?? null; }
    async put(key, value) { this.values.set(key, value); }
    async delete(key) { this.values.delete(key); }
    async list({ prefix = '' } = {}) {
        return {
            keys: [...this.values.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })),
            list_complete: true,
        };
    }
}

function config() {
    return {
        HOST: 'worker.example',
        UUID: '00000000-0000-4000-8000-000000000000',
        TUNNEL_PATH: '/tunnel',
        TRANSPORTS: ['ws', 'xhttp', 'grpc'],
        Fingerprint: 'chrome',
        跳过证书验证: false,
        启用0RTT: false,
        SHADOWSOCKS: { enabled: true, method: 'aes-128-gcm', tls: true },
        优选订阅生成: { SUBNAME: 'edge', SUBUpdateTime: 3 },
        CF: { Usage: { success: false, pages: 0, workers: 0, total: 0, max: 100000 } },
        TG: { 启用: false },
    };
}

function request(path, { method = 'GET', body, origin = true } = {}) {
    const headers = new Headers({ Accept: 'application/json' });
    if (origin && method !== 'GET') headers.set('Origin', 'https://worker.example');
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    return new Request(`https://worker.example/${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

test('admin bootstrap exposes safe UI state and tokenized native export URLs', async () => {
    const kv = new MemoryKV({
        'log.json': JSON.stringify([{ TYPE: 'Get_SUB', IP: '203.0.113.5', URL: 'https://worker.example/sub?token=secret&ip=104.18.35.249', UA: 'Mihomo', TIME: 1 }]),
        'cf.json': JSON.stringify({ AccountID: 'a'.repeat(32), APIToken: 'super-secret-token-value' }),
    });
    const response = await handleAdminApi(request('admin/api/bootstrap'), { KV: kv }, config(), 'admin/api/bootstrap');
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.service.host, 'worker.example');
    assert.equal(payload.service.maskedUuid.includes('00000000'), true);
    assert.equal(payload.stats.nodeCount, 6);
    assert.equal(payload.stats.subscriptionRequests, 1);
    assert.equal(new URL(payload.exports.clash).searchParams.get('format'), 'clash');
    assert.doesNotMatch(JSON.stringify(payload), /super-secret-token-value/);
    assert.doesNotMatch(payload.logs[0].url, /token=/);
});

test('preferred-IP preview changes server while preserving the Worker hostname', async () => {
    const response = await handleAdminApi(
        request('admin/api/preview?ip=104.18.35.249&port=443&name=CT'),
        { KV: new MemoryKV() },
        config(),
        'admin/api/preview',
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.server.address, '104.18.35.249');
    assert.equal(payload.nodes.length, 6);
    assert.equal(payload.nodes.every((node) => node.server === '104.18.35.249'), true);
    assert.equal(payload.nodes.every((node) => decodeURIComponent(node.shareLink).includes('worker.example')), true);
    assert.equal(new URL(payload.urls.clash).searchParams.get('ip'), '104.18.35.249');
});

test('same-origin settings update is bounded and preserves unrelated configuration', async () => {
    const kv = new MemoryKV({ 'config.json': JSON.stringify({ CUSTOM: 'preserve', 优选订阅生成: {}, SHADOWSOCKS: {} }) });
    const body = {
        subscriptionName: 'My Edge',
        tunnelPath: '/tunnel',
        fingerprint: 'chrome',
        updateInterval: 6,
        transports: ['ws', 'grpc'],
        shadowsocks: true,
        zeroRtt: false,
        skipCertificateVerification: false,
    };
    const rejected = await handleAdminApi(request('admin/api/settings', { method: 'POST', body, origin: false }), { KV: kv }, config(), 'admin/api/settings');
    assert.equal(rejected.status, 403);

    const saved = await handleAdminApi(request('admin/api/settings', { method: 'POST', body }), { KV: kv }, config(), 'admin/api/settings');
    assert.equal(saved.status, 200);
    const stored = JSON.parse(await kv.get('config.json'));
    assert.equal(stored.CUSTOM, 'preserve');
    assert.equal(stored.TUNNEL_PATH, '/tunnel');
    assert.deepEqual(stored.TRANSPORTS, ['ws', 'grpc']);
    assert.equal(stored.优选订阅生成.SUBNAME, 'My Edge');
});

test('preferred IP imports are normalized, deduplicated and persisted', async () => {
    const kv = new MemoryKV();
    const response = await handleAdminApi(request('admin/api/preferred-ips', {
        method: 'POST',
        body: { importText: '104.18.35.249:443#CT,28ms\n104.18.35.249:443#CT-fast,25ms\n[2606:4700::1111]:443#IPv6,42ms\ninvalid' },
    }), { KV: kv }, config(), 'admin/api/preferred-ips');
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.entries.length, 2);
    assert.equal(payload.entries.find((entry) => entry.address === '104.18.35.249').latency, 25);
    assert.equal(payload.entries.some((entry) => entry.address === '2606:4700::1111'), true);
    assert.equal(JSON.parse(await kv.get('preferred-ips.json')).length, 2);
});

test('safe backups exclude credentials and restore UI-managed settings', async () => {
    const kv = new MemoryKV({
        'preferred-ips.json': JSON.stringify([{ address: '104.18.35.249', port: 443, label: 'CT' }]),
        'cf.json': JSON.stringify({ AccountID: 'a'.repeat(32), APIToken: 'secret-api-token-value' }),
        'tg.json': JSON.stringify({ BotToken: '123456:secret-bot-token-value', ChatID: '123456' }),
    });
    const backupResponse = await handleAdminApi(request('admin/api/backup'), { KV: kv }, config(), 'admin/api/backup');
    assert.equal(backupResponse.status, 200);
    const backup = await backupResponse.json();
    assert.equal(backup.schema, 're-edgetunnel-ui-backup-v1');
    assert.equal(backup.preferredIps.length, 1);
    assert.doesNotMatch(JSON.stringify(backup), /00000000-0000-4000-8000-000000000000|secret-api-token|secret-bot-token/);

    backup.settings.subscriptionName = 'Restored';
    const restore = await handleAdminApi(request('admin/api/restore', { method: 'POST', body: { backup } }), { KV: kv }, config(), 'admin/api/restore');
    assert.equal(restore.status, 200);
    const stored = JSON.parse(await kv.get('config.json'));
    assert.equal(stored.优选订阅生成.SUBNAME, 'Restored');
});

test('UI reset restores only managed settings and preserves operator configuration', async () => {
    const kv = new MemoryKV({
        'config.json': JSON.stringify({
            CUSTOM: 'preserve',
            反代: { PROXYIP: 'operator.example' },
            优选订阅生成: { SUBNAME: 'custom', SUBUpdateTime: 12 },
            SHADOWSOCKS: { enabled: false, method: 'aes-256-gcm', tls: true },
        }),
    });
    const response = await handleAdminApi(
        request('admin/api/reset', { method: 'POST' }),
        { KV: kv },
        config(),
        'admin/api/reset',
    );
    assert.equal(response.status, 200);
    const stored = JSON.parse(await kv.get('config.json'));
    assert.equal(stored.CUSTOM, 'preserve');
    assert.equal(stored.反代.PROXYIP, 'operator.example');
    assert.equal(stored.优选订阅生成.SUBNAME, 'edgetunnel');
    assert.equal(stored.TUNNEL_PATH, '/tunnel');
    assert.deepEqual(stored.TRANSPORTS, ['ws', 'xhttp', 'grpc']);
    assert.equal(stored.SHADOWSOCKS.method, 'aes-256-gcm');
    assert.equal(stored.SHADOWSOCKS.enabled, true);
});

test('QR endpoint and session revocation are protected same-origin mutations', async () => {
    const kv = new MemoryKV({ 'session:first': 'active', 'session:second': 'active', 'config.json': '{}' });
    const qr = await handleAdminApi(request('admin/api/qr', { method: 'POST', body: { text: 'https://worker.example/sub' } }), { KV: kv }, config(), 'admin/api/qr');
    assert.equal(qr.status, 200);
    assert.match((await qr.json()).svg, /^<svg/);

    const revoked = await handleAdminApi(request('admin/api/sessions/revoke', { method: 'POST' }), { KV: kv }, config(), 'admin/api/sessions/revoke');
    assert.equal(revoked.status, 200);
    assert.equal((await revoked.json()).revoked, 2);
    assert.equal(await kv.get('session:first'), null);
    assert.equal(await kv.get('config.json'), '{}');
});
