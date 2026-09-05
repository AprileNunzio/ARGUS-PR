import { connect } from 'node:net';
import { randomBytes } from 'node:crypto';
import { parseChallenge, authorisationFor } from './rtsp_auth.js';
import { parseSdp, findBackchannel, resolveControl } from './sdp.js';

const CONNECT_TIMEOUT_MS = 6000;
const REPLY_TIMEOUT_MS = 8000;
const USER_AGENT = 'ARGUS-PR';
const REQUIRE_HEADER = 'www.onvif.org/ver20/backchannel';

export function parseRtspUrl(raw) {
    const url = new URL(String(raw ?? '').replace(/^rtsp:/i, 'http:'));
    if (url.hostname.length === 0) throw new Error('URL RTSP senza indirizzo');

    return {
        host: url.hostname,
        port: Number.parseInt(url.port, 10) || 554,
        path: `${url.pathname}${url.search}`,
        base: `rtsp://${url.hostname}:${Number.parseInt(url.port, 10) || 554}${url.pathname}${url.search}`
    };
}

function parseReply(text) {
    const [head, body = ''] = text.split('\r\n\r\n');
    const lines = head.split('\r\n');
    const status = Number.parseInt(/^RTSP\/1\.\d\s+(\d+)/.exec(lines[0])?.[1] ?? '0', 10);
    const headers = {};

    for (const line of lines.slice(1)) {
        const separator = line.indexOf(':');
        if (separator < 0) continue;
        headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
    }

    return { status, headers, body };
}

export function createRtspSession({ url, username, password }) {
    const target = parseRtspUrl(url);

    let socket = null;
    let sequence = 0;
    let challenge = null;
    let nonceCount = 0;
    let sessionId = null;
    let buffer = Buffer.alloc(0);
    let waiting = null;

    const consume = () => {
        if (!waiting) return;

        const separator = buffer.indexOf('\r\n\r\n');
        if (separator < 0) return;

        const head = buffer.subarray(0, separator + 4).toString('latin1');
        const length = Number.parseInt(/content-length:\s*(\d+)/i.exec(head)?.[1] ?? '0', 10);
        if (buffer.length < separator + 4 + length) return;

        const text = buffer.subarray(0, separator + 4 + length).toString('latin1');
        buffer = buffer.subarray(separator + 4 + length);

        const pending = waiting;
        waiting = null;
        clearTimeout(pending.timer);
        pending.resolve(parseReply(text));
    };

    const open = () => new Promise((resolve, reject) => {
        socket = connect({ host: target.host, port: target.port });
        socket.setTimeout(CONNECT_TIMEOUT_MS);

        socket.once('connect', () => {
            socket.setTimeout(0);
            resolve();
        });

        socket.once('timeout', () => {
            socket.destroy();
            reject(new Error('la telecamera non ha aperto la sessione RTSP'));
        });

        socket.on('error', (error) => {
            if (waiting) {
                const pending = waiting;
                waiting = null;
                clearTimeout(pending.timer);
                pending.reject(error);
                return;
            }
            reject(error);
        });

        socket.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            consume();
        });
    });

    const exchange = (method, uri, extra = {}, body = '') => new Promise((resolve, reject) => {
        sequence += 1;
        nonceCount += 1;

        const headers = {
            CSeq: String(sequence),
            'User-Agent': USER_AGENT,
            ...extra
        };

        if (sessionId) headers.Session = sessionId;

        const authorisation = authorisationFor({ challenge, username, password, method, uri, nonceCount });
        if (authorisation) headers.Authorization = authorisation;

        if (body.length > 0) headers['Content-Length'] = String(Buffer.byteLength(body, 'utf8'));

        const lines = Object.entries(headers).map(([key, value]) => `${key}: ${value}`);
        const request = `${method} ${uri} RTSP/1.0\r\n${lines.join('\r\n')}\r\n\r\n${body}`;

        const timer = setTimeout(() => {
            waiting = null;
            reject(new Error(`${method}: la telecamera non ha risposto`));
        }, REPLY_TIMEOUT_MS);

        waiting = { resolve, reject, timer };
        socket.write(request, 'latin1');
    });

    const authenticated = async (method, uri, extra = {}, body = '') => {
        let reply = await exchange(method, uri, extra, body);

        if (reply.status === 401 && username) {
            challenge = parseChallenge(reply.headers['www-authenticate']);
            nonceCount = 0;
            reply = await exchange(method, uri, extra, body);
        }

        if (reply.status < 200 || reply.status > 299) {
            throw new Error(`${method} rifiutato dalla telecamera (${reply.status || 'nessuna risposta'})`);
        }

        return reply;
    };

    return {
        target,
        async connect() {
            await open();
            await authenticated('OPTIONS', target.base, { Require: REQUIRE_HEADER });
        },
        async describe() {
            const reply = await authenticated('DESCRIBE', target.base, {
                Accept: 'application/sdp',
                Require: REQUIRE_HEADER
            });

            const session = parseSdp(reply.body);
            const backchannel = findBackchannel(session);
            if (!backchannel) throw new Error('la telecamera non espone un canale audio in ingresso');

            const base = reply.headers['content-base'] ?? reply.headers['content-location'] ?? target.base;
            return { ...backchannel, url: resolveControl(base, backchannel.control) };
        },
        async setup(controlUrl) {
            const reply = await authenticated('SETUP', controlUrl, {
                Transport: 'RTP/AVP/TCP;unicast;interleaved=0-1',
                Require: REQUIRE_HEADER
            });

            sessionId = (reply.headers.session ?? '').split(';')[0].trim() || null;
            if (!sessionId) throw new Error('la telecamera non ha assegnato una sessione RTSP');
            return sessionId;
        },
        async record() {
            await authenticated('RECORD', target.base, { Range: 'npt=0.000-', Require: REQUIRE_HEADER });
        },
        write(frame) {
            if (!socket || socket.destroyed) throw new Error('sessione audio chiusa');
            socket.write(frame);
        },
        async teardown() {
            if (!socket || socket.destroyed) return;
            await authenticated('TEARDOWN', target.base).catch(() => null);
            socket.destroy();
            socket = null;
        },
        close() {
            if (socket && !socket.destroyed) socket.destroy();
            socket = null;
        }
    };
}

export function interleave(channel, payload) {
    const header = Buffer.alloc(4);
    header[0] = 0x24;
    header[1] = channel;
    header.writeUInt16BE(payload.length, 2);
    return Buffer.concat([header, payload]);
}

export function createRtpPacker({ payloadType, clockRate = 8000 }) {
    const ssrc = randomBytes(4).readUInt32BE(0);
    let sequence = randomBytes(2).readUInt16BE(0);
    let timestamp = randomBytes(4).readUInt32BE(0);

    return function pack(samples) {
        const header = Buffer.alloc(12);
        header[0] = 0x80;
        header[1] = payloadType & 0x7f;
        header.writeUInt16BE(sequence, 2);
        header.writeUInt32BE(timestamp, 4);
        header.writeUInt32BE(ssrc, 8);

        sequence = (sequence + 1) & 0xffff;
        timestamp = (timestamp + samples.length) >>> 0;

        return Buffer.concat([header, samples]);
    };
}
