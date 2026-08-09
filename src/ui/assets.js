import { ADMIN_SCRIPT } from './admin-script.js';
import { LOGIN_SCRIPT } from './login-script.js';
import { UI_STYLES } from './styles.js';

const COMMON_SECURITY_HEADERS = {
    'Cache-Control': 'no-store, private, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

export function htmlSecurityHeaders() {
    return {
        ...COMMON_SECURITY_HEADERS,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
    };
}

export function apiSecurityHeaders(contentType = 'application/json; charset=utf-8') {
    return {
        ...COMMON_SECURITY_HEADERS,
        'Content-Type': contentType,
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    };
}

export function uiAssetResponse(path) {
    const assets = {
        'assets/edgetunnel-ui.css': [UI_STYLES, 'text/css; charset=utf-8'],
        'assets/edgetunnel-login.js': [LOGIN_SCRIPT, 'text/javascript; charset=utf-8'],
        'assets/edgetunnel-admin.js': [ADMIN_SCRIPT, 'text/javascript; charset=utf-8'],
    };
    const asset = assets[path];
    if (!asset) return null;
    return new Response(asset[0], {
        status: 200,
        headers: {
            ...COMMON_SECURITY_HEADERS,
            'Content-Type': asset[1],
            'Cross-Origin-Resource-Policy': 'same-origin',
        },
    });
}
