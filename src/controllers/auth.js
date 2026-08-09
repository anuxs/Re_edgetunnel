
import { loginPage } from '../ui/pages.js';
import { apiSecurityHeaders, htmlSecurityHeaders } from '../ui/assets.js';

const SESSION_TTL_SECONDS = 60 * 60 * 24;
const SESSION_PREFIX = 'session:';
const LOGIN_ATTEMPT_PREFIX = 'login-attempt:';
const MAX_LOGIN_ATTEMPTS = 8;

function getAdminPassword(env) {
    return env.ADMIN || env.admin || env.PASSWORD || env.password || env.pswd || env.TOKEN || env.KEY || env.UUID || env.uuid;
}

function getCookie(request, name) {
    const cookies = request.headers.get('Cookie') || '';
    return cookies.split(';').map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function sessionKey(token) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return `${SESSION_PREFIX}${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function createSessionToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeEqual(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string') return false;
    const leftBytes = new TextEncoder().encode(left);
    const rightBytes = new TextEncoder().encode(right);
    if (leftBytes.length !== rightBytes.length) return false;
    let difference = 0;
    for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
    return difference === 0;
}

async function loginAttemptKey(request) {
    const address = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Real-IP') || 'unknown';
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address));
    return `${LOGIN_ATTEMPT_PREFIX}${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function wantsJson(request) {
    return (request.headers.get('Accept') || '').toLowerCase().includes('application/json');
}

export function isTrustedRequestOrigin(request) {
    const requestUrl = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (origin) return origin === requestUrl.origin;

    const referer = request.headers.get('Referer');
    if (!referer) return false;
    try {
        return new URL(referer).origin === requestUrl.origin;
    } catch {
        return false;
    }
}

export async function checkAuth(request, env) {
    const authCookie = getCookie(request, 'auth');
    if (!authCookie || !env.KV?.get) return false;

    return (await env.KV.get(await sessionKey(authCookie))) === 'active';
}

export async function handleLogin(request, env) {
    const adminPassword = getAdminPassword(env);

    if (request.method === 'POST' && adminPassword && env.KV?.put) {
        const attemptKey = await loginAttemptKey(request);
        const attempts = Number(await env.KV.get(attemptKey) || 0);
        if (attempts >= MAX_LOGIN_ATTEMPTS) {
            return wantsJson(request)
                ? new Response(JSON.stringify({ success: false, error: 'Too many login attempts. Try again later.' }), { status: 429, headers: apiSecurityHeaders() })
                : new Response(loginPage('登录尝试过多，请稍后再试。'), { status: 429, headers: htmlSecurityHeaders() });
        }
        const formData = await request.text();
        const params = new URLSearchParams(formData);
        const inputPassword = params.get('password');
        if (safeEqual(inputPassword, adminPassword)) {
            const authValue = createSessionToken();
            await env.KV.put(await sessionKey(authValue), 'active', { expirationTtl: SESSION_TTL_SECONDS });
            await env.KV.delete?.(attemptKey);
            const response = new Response(JSON.stringify({ success: true }), { status: 200, headers: apiSecurityHeaders() });
            response.headers.set('Set-Cookie', `auth=${authValue}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`);
            return response;
        }
        await env.KV.put(attemptKey, String(attempts + 1), { expirationTtl: 10 * 60 });
        return wantsJson(request)
            ? new Response(JSON.stringify({ success: false, error: 'Invalid password' }), { status: 401, headers: apiSecurityHeaders() })
            : new Response(loginPage('密码不正确，请重新输入。'), { status: 401, headers: htmlSecurityHeaders() });
    }
    return new Response(loginPage(), { status: 200, headers: htmlSecurityHeaders() });
}

export async function handleLogout(request, env) {
    const authCookie = getCookie(request, 'auth');
    if (authCookie && env.KV?.delete) {
        await env.KV.delete(await sessionKey(authCookie));
    }
    const response = new Response('Redirecting...', { status: 302, headers: { 'Location': '/login' } });
    response.headers.set('Set-Cookie', 'auth=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict');
    return response;
}

export async function revokeAllSessions(env) {
    if (!env.KV?.list || !env.KV?.delete) throw new Error('KV session listing is unavailable');
    let cursor;
    let revoked = 0;
    do {
        const page = await env.KV.list({ prefix: SESSION_PREFIX, cursor, limit: 1000 });
        const keys = Array.isArray(page.keys) ? page.keys : [];
        for (let index = 0; index < keys.length; index += 32) {
            await Promise.all(keys.slice(index, index + 32).map((entry) => env.KV.delete(entry.name)));
        }
        revoked += keys.length;
        cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return revoked;
}
