import { getSocks5Account, isSafeConnectTarget } from './helpers.js';
import { socks5Connect, httpConnect } from '../protocols/socks5.js';

export function getProxyCheckTarget(env) {
    const hostname = env.PROXY_CHECK_HOST?.trim();
    const port = Number(env.PROXY_CHECK_PORT || 80);
    const path = env.PROXY_CHECK_PATH || '/';
    if (!isSafeConnectTarget(hostname, port) || !path.startsWith('/') || /[\r\n]/.test(path)) return null;
    return { hostname, port, path };
}

function redactProxy(protocol, value) {
    const address = String(value || '');
    const at = address.lastIndexOf('@');
    return `${protocol}://${at === -1 ? address : `***@${address.slice(at + 1)}`}`;
}

export async function checkProxyConnection(protocol, value, target) {
    const startTime = Date.now();
    const proxy = redactProxy(protocol, value);
    if (!['socks5', 'http'].includes(protocol)) return { success: false, error: 'Unsupported proxy type', proxy, responseTime: 0 };
    if (typeof value !== 'string' || !value.trim() || value.length > 1024 || /[\r\n\0]/.test(value)) {
        return { success: false, error: 'Invalid proxy address', proxy, responseTime: Date.now() - startTime };
    }

    let parsed;
    try {
        parsed = await getSocks5Account(value.trim());
    } catch (error) {
        return { success: false, error: error.message, proxy, responseTime: Date.now() - startTime };
    }

    try {
        const tcpSocket = protocol === 'socks5'
            ? await socks5Connect(target.hostname, target.port, new Uint8Array(0), parsed)
            : await httpConnect(target.hostname, target.port, new Uint8Array(0), parsed);
        if (!tcpSocket) return { success: false, error: 'Unable to connect to the proxy', proxy, responseTime: Date.now() - startTime };

        try {
            const writer = tcpSocket.writable.getWriter();
            await writer.write(new TextEncoder().encode(`GET ${target.path} HTTP/1.1\r\nHost: ${target.hostname}\r\nConnection: close\r\n\r\n`));
            writer.releaseLock();

            const reader = tcpSocket.readable.getReader();
            const decoder = new TextDecoder();
            let response = '';
            let bytesRead = 0;
            try {
                while (bytesRead < 64 * 1024) {
                    const { done, value: chunk } = await reader.read();
                    if (done) break;
                    bytesRead += chunk.byteLength;
                    response += decoder.decode(chunk, { stream: true });
                }
            } finally {
                reader.releaseLock();
            }
            await tcpSocket.close();
            return {
                success: true,
                proxy,
                ip: response.match(/(?:^|\n)ip=(.*)/)?.[1]?.trim() || null,
                location: response.match(/(?:^|\n)loc=(.*)/)?.[1]?.trim() || null,
                responseTime: Date.now() - startTime,
            };
        } catch (error) {
            try { await tcpSocket.close(); } catch { }
            return { success: false, error: error.message, proxy, responseTime: Date.now() - startTime };
        }
    } catch (error) {
        return { success: false, error: error.message, proxy, responseTime: Date.now() - startTime };
    }
}
