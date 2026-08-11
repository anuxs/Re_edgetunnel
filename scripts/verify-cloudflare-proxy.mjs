import assert from 'node:assert/strict';
import { Duplex } from 'node:stream';
import tls from 'node:tls';
import { sha224 } from '../src/utils/helpers.js';

const [webSocketUrl, credential, targetHost = 'www.google.com', targetPortText = '80', mode = 'plain'] = process.argv.slice(2);
const targetPort = Number(targetPortText);
if (!webSocketUrl || !credential || !Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535 || !['plain', 'tls'].includes(mode)) {
    throw new Error('Usage: node scripts/verify-cloudflare-proxy.mjs <wss-url> <uuid> [target-host] [target-port] [plain|tls]');
}

const encoder = new TextEncoder();
const requestPayload = encoder.encode(`GET / HTTP/1.1\r\nHost: ${targetHost}\r\nConnection: close\r\n\r\n`);
const hostBytes = encoder.encode(targetHost);

function portBytes() {
    return [targetPort >> 8, targetPort & 0xff];
}

function vlessPacket(payload = requestPayload) {
    const uuidBytes = credential.replaceAll('-', '').match(/../g)?.map((pair) => Number.parseInt(pair, 16));
    if (!uuidBytes || uuidBytes.length !== 16 || uuidBytes.some(Number.isNaN)) throw new Error('VLESS credential must be a UUID');
    return new Uint8Array([0, ...uuidBytes, 0, 1, ...portBytes(), 2, hostBytes.length, ...hostBytes, ...payload]);
}

function trojanPacket(payload = requestPayload) {
    const passwordHash = encoder.encode(sha224(credential));
    return new Uint8Array([...passwordHash, 0x0d, 0x0a, 1, 3, hostBytes.length, ...hostBytes, ...portBytes(), 0x0d, 0x0a, ...payload]);
}

async function verifyProtocol(name, packet, responseHeaderBytes) {
    const response = await new Promise((resolve, reject) => {
        const socket = new WebSocket(webSocketUrl);
        socket.binaryType = 'arraybuffer';
        const timeout = setTimeout(() => {
            socket.close();
            reject(new Error(`${name} proxy response timed out`));
        }, 20_000);
        socket.addEventListener('open', () => socket.send(packet));
        socket.addEventListener('message', (event) => {
            clearTimeout(timeout);
            socket.close();
            resolve(new Uint8Array(event.data));
        });
        socket.addEventListener('error', (event) => {
            clearTimeout(timeout);
            reject(event.error || new Error(`${name} WebSocket error`));
        });
    });

    if (responseHeaderBytes) assert.deepEqual([...response.slice(0, responseHeaderBytes)], [0, 0]);
    const text = new TextDecoder().decode(response.slice(responseHeaderBytes));
    assert.match(text, /^HTTP\/1\.[01] [1-5]\d\d/, `${name} did not return a valid HTTP response through TCP`);
    console.log(`${name.toUpperCase()}_TCP_PROXY_OK`);
}

async function verifyTlsProtocol(name, packet, responseHeaderBytes) {
    await new Promise((resolve, reject) => {
        const socket = new WebSocket(webSocketUrl);
        socket.binaryType = 'arraybuffer';
        let secureSocket;
        let settled = false;
        let responseText = '';
        let remainingHeaderBytes = responseHeaderBytes;
        const timeout = setTimeout(() => finish(new Error(`${name} TLS proxy response timed out`)), 30_000);
        const tunnel = new Duplex({
            read() { },
            write(chunk, _encoding, callback) {
                try {
                    if (socket.readyState !== WebSocket.OPEN) throw new Error(`${name} WebSocket is not open`);
                    socket.send(chunk);
                    callback();
                } catch (error) {
                    callback(error);
                }
            },
        });

        function finish(error) {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            try { secureSocket?.destroy(); } catch { }
            try { socket.close(); } catch { }
            if (error) reject(error);
            else resolve();
        }

        socket.addEventListener('open', () => {
            socket.send(packet);
            secureSocket = tls.connect({
                socket: tunnel,
                servername: targetHost,
                rejectUnauthorized: true,
            });
            secureSocket.once('secureConnect', () => {
                secureSocket.write(`GET /backend-api/codex/responses HTTP/1.1\r\nHost: ${targetHost}\r\nConnection: close\r\nUser-Agent: Re-edgetunnel-verifier\r\n\r\n`);
            });
            secureSocket.on('data', (chunk) => {
                responseText += chunk.toString('latin1');
                const headerEnd = responseText.indexOf('\r\n\r\n');
                if (headerEnd === -1) return;
                try {
                    assert.match(responseText.slice(0, headerEnd), /^HTTP\/1\.[01] [1-5]\d\d/);
                    finish();
                } catch (error) {
                    finish(error);
                }
            });
            secureSocket.on('error', finish);
        });
        socket.addEventListener('message', (event) => {
            let chunk = new Uint8Array(event.data);
            if (remainingHeaderBytes) {
                const consumed = Math.min(remainingHeaderBytes, chunk.byteLength);
                for (let index = 0; index < consumed; index += 1) {
                    if (chunk[index] !== 0) return finish(new Error(`${name} returned an invalid tunnel response header`));
                }
                remainingHeaderBytes -= consumed;
                chunk = chunk.slice(consumed);
            }
            if (chunk.byteLength) tunnel.push(Buffer.from(chunk));
        });
        socket.addEventListener('close', () => {
            tunnel.push(null);
            if (!settled) finish(new Error(`${name} WebSocket closed before the TLS response`));
        });
        socket.addEventListener('error', (event) => finish(event.error || new Error(`${name} WebSocket error`)));
    });
    console.log(`${name.toUpperCase()}_TLS_PROXY_OK`);
}

if (mode === 'tls') {
    const emptyPayload = new Uint8Array();
    await verifyTlsProtocol('vless', vlessPacket(emptyPayload), 2);
    await verifyTlsProtocol('trojan', trojanPacket(emptyPayload), 0);
} else {
    await verifyProtocol('vless', vlessPacket(), 2);
    await verifyProtocol('trojan', trojanPacket(), 0);
}
