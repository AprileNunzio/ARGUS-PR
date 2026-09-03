import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

const DEFAULT_TIMEOUT_MS = 10000;

export function encodeLength(value) {
    const bytes = [];
    let remaining = value;

    do {
        let digit = remaining % 128;
        remaining = Math.floor(remaining / 128);
        if (remaining > 0) digit |= 0x80;
        bytes.push(digit);
    } while (remaining > 0);

    return Buffer.from(bytes);
}

export function encodeString(value) {
    const payload = Buffer.from(String(value), 'utf8');
    const header = Buffer.alloc(2);
    header.writeUInt16BE(payload.length, 0);
    return Buffer.concat([header, payload]);
}

export function buildConnect({ clientId, username, password, keepAlive = 30 }) {
    let flags = 0x02;
    if (username) flags |= 0x80;
    if (username && password) flags |= 0x40;

    const variable = Buffer.alloc(4);
    variable.writeUInt8(4, 0);
    variable.writeUInt8(flags, 1);
    variable.writeUInt16BE(keepAlive, 2);

    const parts = [encodeString('MQTT'), variable, encodeString(clientId)];
    if (username) parts.push(encodeString(username));
    if (username && password) parts.push(encodeString(password));

    const body = Buffer.concat(parts);
    return Buffer.concat([Buffer.from([0x10]), encodeLength(body.length), body]);
}

export function buildPublish({ topic, payload, retain = false }) {
    const header = 0x30 | (retain ? 0x01 : 0x00);
    const body = Buffer.concat([encodeString(topic), Buffer.from(String(payload), 'utf8')]);
    return Buffer.concat([Buffer.from([header]), encodeLength(body.length), body]);
}

export const DISCONNECT = Buffer.from([0xe0, 0x00]);

export function readConnack(chunk) {
    if (!Buffer.isBuffer(chunk) || chunk.length < 4) return { ok: false, code: null };
    if (chunk[0] !== 0x20) return { ok: false, code: null };
    return { ok: chunk[3] === 0, code: chunk[3] };
}

const CONNACK_ERRORS = Object.freeze({
    1: 'versione del protocollo non accettata',
    2: 'identificativo client rifiutato',
    3: 'servizio non disponibile',
    4: 'utente o password non validi',
    5: 'non autorizzato'
});

function openSocket(options) {
    return new Promise((resolve, reject) => {
        const socket = options.tls
            ? tlsConnect({ host: options.host, port: options.port, servername: options.host, rejectUnauthorized: options.rejectUnauthorized !== false })
            : netConnect({ host: options.host, port: options.port });

        const onError = (error) => reject(error);
        socket.once('error', onError);
        socket.once(options.tls ? 'secureConnect' : 'connect', () => {
            socket.removeListener('error', onError);
            resolve(socket);
        });
    });
}

export async function publish(options) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const socket = await openSocket(options);

    try {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('il broker MQTT non ha risposto')), timeoutMs);

            socket.once('data', (chunk) => {
                clearTimeout(timer);
                const connack = readConnack(chunk);
                if (!connack.ok) {
                    reject(new Error(`connessione MQTT rifiutata: ${CONNACK_ERRORS[connack.code] ?? 'motivo sconosciuto'}`));
                    return;
                }
                resolve();
            });

            socket.once('error', (error) => {
                clearTimeout(timer);
                reject(error);
            });

            socket.write(buildConnect({
                clientId: options.clientId ?? `argus-${Math.random().toString(16).slice(2, 10)}`,
                username: options.username,
                password: options.password
            }));
        });

        socket.write(buildPublish({ topic: options.topic, payload: options.payload, retain: options.retain === true }));
        socket.write(DISCONNECT);

        return { published: true };
    } finally {
        socket.end();
    }
}
