import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isCloudflareIp,
    parseUpstreamProxyMode,
    resolveHostAddresses,
    shouldUseUpstreamProxy,
} from '../src/core/upstream-routing.js';

const upstream = { type: 'https', hostname: 'proxy.example', port: 443 };

test('upstream routing mode is backwards compatible and rejects typos', () => {
    assert.equal(parseUpstreamProxyMode(), 'always');
    assert.equal(parseUpstreamProxyMode('always'), 'always');
    assert.equal(parseUpstreamProxyMode(' CLOUDFLARE '), 'cloudflare');
    assert.equal(parseUpstreamProxyMode('cloudflare-only'), 'cloudflare');
    assert.throws(() => parseUpstreamProxyMode('automatic'), /UPSTREAM_PROXY_MODE/);
});

test('Cloudflare IPv4 and IPv6 ranges are recognized without DNS', () => {
    assert.equal(isCloudflareIp('108.162.196.70'), true);
    assert.equal(isCloudflareIp('104.16.0.1'), true);
    assert.equal(isCloudflareIp('203.0.113.10'), false);
    assert.equal(isCloudflareIp('8.8.8.8'), false);
    assert.equal(isCloudflareIp('2606:4700:4700::1111'), true);
    assert.equal(isCloudflareIp('[2a06:98c0::1]'), true);
    assert.equal(isCloudflareIp('2001:4860:4860::8888'), false);
});

test('cloudflare mode selects only Cloudflare literals and resolved domains', async () => {
    assert.equal(await shouldUseUpstreamProxy('108.162.196.70', upstream, 'cloudflare'), true);
    assert.equal(await shouldUseUpstreamProxy('203.0.113.10', upstream, 'cloudflare'), false);
    assert.equal(await shouldUseUpstreamProxy('chat.example', upstream, 'cloudflare', {
        resolveHost: async () => ['104.18.32.47', '104.18.33.47'],
    }), true);
    assert.equal(await shouldUseUpstreamProxy('direct.example', upstream, 'cloudflare', {
        resolveHost: async () => ['93.184.216.34'],
    }), false);
    assert.equal(await shouldUseUpstreamProxy('chat.example', null, 'cloudflare', {
        resolveHost: async () => { throw new Error('must not resolve without an upstream'); },
    }), false);
});

test('always mode does not perform a DNS lookup', async () => {
    assert.equal(await shouldUseUpstreamProxy('example.com', upstream, 'always', {
        resolveHost: async () => { throw new Error('unexpected lookup'); },
    }), true);
});

test('DNS routing lookup queries A and AAAA once and honors the TTL cache', async () => {
    const cache = new Map();
    let requests = 0;
    const fetchImpl = async (url) => {
        requests += 1;
        const type = new URL(url).searchParams.get('type');
        const answer = type === 'A'
            ? [{ type: 1, TTL: 120, data: '104.18.32.47' }]
            : [{ type: 28, TTL: 120, data: '2606:4700::6812:202f' }];
        return new Response(JSON.stringify({ Status: 0, Answer: answer }));
    };

    assert.deepEqual(await resolveHostAddresses('Chat.Example.', { fetchImpl, cache, now: 1_000 }), [
        '104.18.32.47',
        '2606:4700::6812:202f',
    ]);
    assert.deepEqual(await resolveHostAddresses('chat.example', { fetchImpl, cache, now: 2_000 }), [
        '104.18.32.47',
        '2606:4700::6812:202f',
    ]);
    assert.equal(requests, 2);
});

test('DNS lookup failures fail open to the direct route', async () => {
    const addresses = await resolveHostAddresses('unavailable.example', {
        fetchImpl: async () => { throw new Error('resolver unavailable'); },
        cache: new Map(),
        now: 1_000,
    });
    assert.deepEqual(addresses, []);
    assert.equal(await shouldUseUpstreamProxy('unavailable.example', upstream, 'cloudflare', {
        resolveHost: async () => addresses,
    }), false);
});
