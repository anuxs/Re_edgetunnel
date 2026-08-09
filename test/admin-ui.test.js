import test from 'node:test';
import assert from 'node:assert/strict';
import { adminPage, loginPage } from '../src/ui/pages.js';
import { ADMIN_SCRIPT } from '../src/ui/admin-script.js';
import { LOGIN_SCRIPT } from '../src/ui/login-script.js';
import { UI_STYLES } from '../src/ui/styles.js';
import { htmlSecurityHeaders, uiAssetResponse } from '../src/ui/assets.js';
import { renderQrSvg } from '../src/ui/qr.js';

test('login and admin pages are self-hosted responsive application shells', () => {
    const login = loginPage();
    const admin = adminPage();
    assert.match(login, /<form method="post">/);
    assert.match(login, /edgetunnel-login\.js/);
    assert.match(admin, /data-view-panel="overview"/);
    assert.match(admin, /data-view-panel="preferred"/);
    assert.match(admin, /data-view-panel="security"/);
    assert.match(admin, /优选 IP/);
    assert.match(admin, /format=clash\|links|ip 参数/);
    assert.doesNotMatch(login + admin, /https?:\/\//i);
    assert.match(UI_STYLES, /@media \(max-width: 780px\)/);
    assert.match(UI_STYLES, /prefers-color-scheme/);
    assert.match(UI_STYLES, /\.node-card \{ min-width: 0;/);
    assert.match(UI_STYLES, /\.two-col, \.equal-col, \.node-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});

test('browser assets contain valid JavaScript and no external runtime dependency', () => {
    assert.doesNotThrow(() => new Function(ADMIN_SCRIPT));
    assert.doesNotThrow(() => new Function(LOGIN_SCRIPT));
    assert.doesNotMatch(ADMIN_SCRIPT + LOGIN_SCRIPT + UI_STYLES, /https?:\/\//i);

    const script = uiAssetResponse('assets/edgetunnel-admin.js');
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
    assert.equal(script.headers.get('cache-control').includes('no-store'), true);
    assert.equal(uiAssetResponse('assets/missing.js'), null);
});

test('UI security headers prevent framing and external script execution', () => {
    const headers = new Headers(htmlSecurityHeaders());
    assert.equal(headers.get('x-frame-options'), 'DENY');
    assert.equal(headers.get('referrer-policy'), 'no-referrer');
    assert.match(headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.doesNotMatch(headers.get('content-security-policy'), /script-src[^;]*unsafe-inline/);
});

test('QR rendering is bundled, deterministic, and contains no user-controlled markup', () => {
    const value = 'vless://00000000-0000-4000-8000-000000000000@104.18.35.249:443?security=tls&sni=worker.example#node';
    const svg = renderQrSvg(value);
    assert.match(svg, /^<svg/);
    assert.match(svg, /<path d="M/);
    assert.doesNotMatch(svg, /vless|worker\.example/);
    assert.throws(() => renderQrSvg(''), /between 1 and 4096/);
});
