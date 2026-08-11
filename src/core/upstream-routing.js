// Cloudflare publishes these owned network ranges at:
// https://www.cloudflare.com/ips-v4/ and https://www.cloudflare.com/ips-v6/
// Keep the snapshot covered by tests so changes are deliberate and reviewable.
const CLOUDFLARE_IPV4_CIDRS = Object.freeze([
    '173.245.48.0/20',
    '103.21.244.0/22',
    '103.22.200.0/22',
    '103.31.4.0/22',
    '141.101.64.0/18',
    '108.162.192.0/18',
    '190.93.240.0/20',
    '188.114.96.0/20',
    '197.234.240.0/22',
    '198.41.128.0/17',
    '162.158.0.0/15',
    '104.16.0.0/13',
    '104.24.0.0/14',
    '172.64.0.0/13',
    '131.0.72.0/22',
]);

const CLOUDFLARE_IPV6_CIDRS = Object.freeze([
    '2400:cb00::/32',
    '2606:4700::/32',
    '2803:f800::/32',
    '2405:b500::/32',
    '2405:8100::/32',
    '2a06:98c0::/29',
    '2c0f:f248::/32',
]);

const CLOUDFLARE_DOH_URL = 'https://cloudflare-dns.com/dns-query';
const DNS_TIMEOUT_MS = 2_000;
const MIN_CACHE_TTL_MS = 30_000;
const MAX_CACHE_TTL_MS = 60 * 60_000;
const NEGATIVE_CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 512;
const dnsRouteCache = new Map();

function normalizeHost(value) {
    return String(value || '').trim().replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

function parseIpv4(value) {
    const parts = String(value).split('.');
    if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
    const octets = parts.map(Number);
    if (octets.some((octet) => octet < 0 || octet > 255)) return null;
    return octets.reduce((result, octet) => result * 256 + octet, 0);
}

function parseIpv6(value) {
    let address = normalizeHost(value);
    if (!address.includes(':') || address.includes('%')) return null;

    const ipv4Match = address.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (ipv4Match) {
        const ipv4 = parseIpv4(ipv4Match[1]);
        if (ipv4 == null) return null;
        address = `${address.slice(0, -ipv4Match[1].length)}${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
    }

    const halves = address.split('::');
    if (halves.length > 2) return null;
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    if ([...left, ...right].some((word) => !/^[0-9a-f]{1,4}$/i.test(word))) return null;

    const missing = 8 - left.length - right.length;
    if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
    const words = halves.length === 2
        ? [...left, ...Array(missing).fill('0'), ...right]
        : left;
    if (words.length !== 8) return null;
    return words.reduce((result, word) => (result << 16n) | BigInt(parseInt(word, 16)), 0n);
}

const parsedIpv4Ranges = CLOUDFLARE_IPV4_CIDRS.map((cidr) => {
    const [network, prefix] = cidr.split('/');
    return { network: parseIpv4(network), prefix: Number(prefix) };
});

const parsedIpv6Ranges = CLOUDFLARE_IPV6_CIDRS.map((cidr) => {
    const [network, prefix] = cidr.split('/');
    return { network: parseIpv6(network), prefix: Number(prefix) };
});

function parseIpLiteral(value) {
    const normalized = normalizeHost(value);
    const ipv4 = parseIpv4(normalized);
    if (ipv4 != null) return { family: 4, value: ipv4 };
    const ipv6 = parseIpv6(normalized);
    if (ipv6 != null) return { family: 6, value: ipv6 };
    return null;
}

export function isCloudflareIp(value) {
    const parsed = parseIpLiteral(value);
    if (!parsed) return false;
    if (parsed.family === 4) {
        return parsedIpv4Ranges.some(({ network, prefix }) => {
            const blockSize = 2 ** (32 - prefix);
            return Math.floor(parsed.value / blockSize) === Math.floor(network / blockSize);
        });
    }
    return parsedIpv6Ranges.some(({ network, prefix }) => {
        const shift = BigInt(128 - prefix);
        return (parsed.value >> shift) === (network >> shift);
    });
}

export function parseUpstreamProxyMode(value) {
    const mode = String(value ?? '').trim().toLowerCase();
    if (!mode || mode === 'always') return 'always';
    if (mode === 'cloudflare' || mode === 'cloudflare-only') return 'cloudflare';
    throw new Error('UPSTREAM_PROXY_MODE must be "always" or "cloudflare"');
}

async function queryDns(hostname, type, fetchImpl, timeoutMs) {
    const url = new URL(CLOUDFLARE_DOH_URL);
    url.searchParams.set('name', hostname);
    url.searchParams.set('type', type);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchImpl(url, {
            headers: { Accept: 'application/dns-json' },
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`DNS lookup returned HTTP ${response.status}`);
        const payload = await response.json();
        if (payload.Status !== 0) return { addresses: [], ttlMs: NEGATIVE_CACHE_TTL_MS };
        const recordType = type === 'A' ? 1 : 28;
        const answers = Array.isArray(payload.Answer) ? payload.Answer : [];
        const matching = answers.filter((answer) => answer?.type === recordType && typeof answer.data === 'string');
        const ttlSeconds = matching.length
            ? Math.min(...matching.map((answer) => Number(answer.TTL) || 60))
            : 60;
        return {
            addresses: matching.map((answer) => normalizeHost(answer.data)),
            ttlMs: Math.min(MAX_CACHE_TTL_MS, Math.max(MIN_CACHE_TTL_MS, ttlSeconds * 1000)),
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

function rememberDnsResult(cache, hostname, addresses, expiresAt) {
    cache.delete(hostname);
    while (cache.size >= MAX_CACHE_ENTRIES) {
        cache.delete(cache.keys().next().value);
    }
    cache.set(hostname, { addresses, expiresAt });
}

export async function resolveHostAddresses(hostname, options = {}) {
    const normalized = normalizeHost(hostname);
    if (!normalized || parseIpLiteral(normalized)) return normalized ? [normalized] : [];
    const fetchImpl = options.fetchImpl || fetch;
    const cache = options.cache || dnsRouteCache;
    const now = typeof options.now === 'function' ? options.now() : (options.now ?? Date.now());
    const timeoutMs = options.timeoutMs || DNS_TIMEOUT_MS;
    const cached = cache.get(normalized);
    if (cached && cached.expiresAt > now) return [...cached.addresses];
    if (cached) cache.delete(normalized);

    const results = await Promise.allSettled([
        queryDns(normalized, 'A', fetchImpl, timeoutMs),
        queryDns(normalized, 'AAAA', fetchImpl, timeoutMs),
    ]);
    const successful = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
    const addresses = [...new Set(successful.flatMap((result) => result.addresses))];
    const ttlMs = successful.length
        ? Math.min(...successful.map((result) => result.ttlMs))
        : NEGATIVE_CACHE_TTL_MS;
    rememberDnsResult(cache, normalized, addresses, now + ttlMs);
    return addresses;
}

export async function shouldUseUpstreamProxy(hostname, upstreamProxy, mode, options = {}) {
    if (!upstreamProxy) return false;
    const parsedMode = parseUpstreamProxyMode(mode);
    if (parsedMode === 'always') return true;

    const normalized = normalizeHost(hostname);
    const literal = parseIpLiteral(normalized);
    if (literal) return isCloudflareIp(normalized);
    if (!normalized) return false;

    const addresses = options.resolveHost
        ? await options.resolveHost(normalized)
        : await resolveHostAddresses(normalized, options);
    return addresses.some((address) => isCloudflareIp(address));
}
