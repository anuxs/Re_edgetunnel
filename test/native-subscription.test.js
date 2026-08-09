import test from 'node:test';
import assert from 'node:assert/strict';
import { MD5MD5 } from '../src/utils/helpers.js';
import {
    buildNativeExportUrls,
    createNativeNodes,
    generateNativeClash,
    generateNativeLinks,
    normalizePreferredTarget,
    resolveTunnelPath,
} from '../src/subscriptions/native.js';
import { handleSub } from '../src/controllers/sub.js';

class MemoryKV {
    constructor(values = {}) { this.values = new Map(Object.entries(values)); }
    async get(key) { return this.values.get(key) ?? null; }
    async put(key, value) { this.values.set(key, value); }
}

function config() {
    return {
        HOST: 'worker.example',
        HOSTS: ['worker.example'],
        UUID: '00000000-0000-4000-8000-000000000000',
        TUNNEL_PATH: '/tunnel',
        TRANSPORTS: ['ws', 'xhttp', 'grpc'],
        Fingerprint: 'chrome',
        跳过证书验证: false,
        启用0RTT: false,
        SHADOWSOCKS: { enabled: true, method: 'aes-128-gcm', tls: true },
        优选订阅生成: { SUBNAME: 'edge', SUBUpdateTime: 3, local: true, 本地IP库: { 随机数量: 1, 指定端口: 443 } },
        订阅转换配置: { SUBAPI: null, SUBCONFIG: null, SUBEMOJI: false },
        TLS分片: null,
        ECH: false,
        ECHConfig: { DNS: null, SNI: null },
        客户端DNS: [],
        本地规则集URL: null,
        随机路径: false,
        TG: { 启用: false },
    };
}

test('preferred targets accept IPv4 and IPv6 but reject hostnames and injection', () => {
    assert.deepEqual(normalizePreferredTarget({ ip: '104.18.35.249', port: '443', name: 'CT' }), {
        address: '104.18.35.249',
        port: 443,
        label: 'CT',
    });
    assert.equal(normalizePreferredTarget({ ip: '[2606:4700::1111]' }).address, '2606:4700::1111');
    assert.throws(() => normalizePreferredTarget({ ip: 'edge.example' }), /IPv4 or IPv6/);
    assert.throws(() => normalizePreferredTarget({ ip: '104.18.35.249\r\nHost: attacker' }), /IPv4 or IPv6/);
    assert.throws(() => normalizePreferredTarget({ ip: '104.18.35.249', port: 70000 }), /port/);
});

test('native node generation changes only server and port for a preferred IP', () => {
    const target = { address: '104.18.35.249', port: 8443, label: 'CT-Guangzhou' };
    const nodes = createNativeNodes(config(), {}, target);
    assert.equal(nodes.length, 6);
    assert.deepEqual(nodes.map((node) => `${node.type}:${node.network || 'ws'}`), [
        'vless:ws',
        'vless:xhttp',
        'vless:grpc',
        'trojan:ws',
        'trojan:grpc',
        'ss:ws',
    ]);
    for (const node of nodes) {
        assert.equal(node.server, target.address);
        assert.equal(node.port, target.port);
        assert.match(node.shareLink, /104\.18\.35\.249:8443/);
        assert.match(decodeURIComponent(node.shareLink), /worker\.example/);
    }
    assert.equal(nodes.find((node) => node.network === 'grpc').grpcServiceName, 'tunnel');
});

test('native Clash output keeps TLS routing on the Worker hostname', () => {
    const nodes = createNativeNodes(config(), {}, { address: '104.18.35.249', port: 443, label: 'Best' });
    const yaml = generateNativeClash(nodes);
    assert.equal(yaml.charCodeAt(0) === 0xfeff, false);
    assert.equal((yaml.match(/server: "104\.18\.35\.249"/g) || []).length, 6);
    assert.match(yaml, /servername: "worker\.example"/);
    assert.match(yaml, /sni: "worker\.example"/);
    assert.match(yaml, /Host: "worker\.example"/);
    assert.match(yaml, /grpc-service-name: "tunnel"/);
    assert.match(yaml, /path: "\/tunnel\?enc=aes-128-gcm"/);
    assert.doesNotMatch(yaml, /server: "worker\.example"/);
    assert.equal(generateNativeLinks(nodes).trim().split('\n').length, 6);
});

test('native export URLs carry an optional preferred IP without changing the token', () => {
    const urls = buildNativeExportUrls('https://worker.example', 'secret-token', { address: '104.18.35.249', port: 443, label: 'CT' });
    for (const value of Object.values(urls)) {
        const url = new URL(value);
        assert.equal(url.pathname, '/sub');
        assert.equal(url.searchParams.get('token'), 'secret-token');
        assert.equal(url.searchParams.get('ip'), '104.18.35.249');
        assert.equal(url.searchParams.get('name'), 'CT');
    }
    assert.equal(new URL(urls.clash).searchParams.get('format'), 'clash');
    assert.equal(new URL(urls.links).searchParams.get('format'), 'links');
});

test('native subscription route downloads preferred-IP Clash while legacy base64 remains available', async () => {
    const value = config();
    const token = await MD5MD5(value.HOST + value.UUID);
    const kv = new MemoryKV({ 'ADD.txt': '203.0.113.10:443#saved' });
    const env = { KV: kv };
    const ctx = { waitUntil() {} };

    const native = await handleSub(new Request(`https://worker.example/sub?token=${token}&format=clash&ip=104.18.35.249&name=CT&download=1`), env, value, ctx);
    assert.equal(native.status, 200);
    assert.match(native.headers.get('content-type'), /yaml/);
    assert.match(native.headers.get('content-disposition'), /attachment/);
    const yaml = await native.text();
    assert.match(yaml, /server: "104\.18\.35\.249"/);
    assert.match(yaml, /servername: "worker\.example"/);

    const legacy = await handleSub(new Request(`https://worker.example/sub?token=${token}&base64`), env, value, ctx);
    assert.equal(legacy.status, 200);
    const decoded = Buffer.from(await legacy.text(), 'base64').toString('utf8');
    assert.match(decoded, /@203\.0\.113\.10:443/);

    const invalid = await handleSub(new Request(`https://worker.example/sub?token=${token}&format=clash&ip=not-an-ip`), env, value, ctx);
    assert.equal(invalid.status, 400);
});

test('tunnel path defaults safely and respects explicit operator configuration', () => {
    assert.equal(resolveTunnelPath({}, {}), '/tunnel');
    assert.equal(resolveTunnelPath({ TUNNEL_PATH: '/custom' }, {}), '/custom');
    assert.equal(resolveTunnelPath({ TUNNEL_PATH: '/custom' }, { PATH: '/env-path' }), '/env-path');
    assert.equal(resolveTunnelPath({ TUNNEL_PATH: 'invalid path' }, {}), '/tunnel');
});
