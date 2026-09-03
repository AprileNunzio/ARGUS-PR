import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD_SECONDS = 30;
const DIGITS = 6;
const REPLAY_WINDOW_MS = 90 * 1000;

const consumedCounters = new Map();

export function base32Encode(buffer) {
    const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    let bits = 0;
    let value = 0;
    let output = '';
    for (let i = 0; i < bytes.length; i++) {
        value = (value << 8) | bytes[i];
        bits += 8;
        while (bits >= 5) {
            output += ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        output += ALPHABET[(value << (5 - bits)) & 31];
    }
    return output;
}

export function base32Decode(str) {
    if (typeof str !== 'string') return Buffer.alloc(0);
    const clean = str.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
    let bits = 0;
    let value = 0;
    const bytes = [];
    for (let i = 0; i < clean.length; i++) {
        const idx = ALPHABET.indexOf(clean[i]);
        if (idx === -1) return Buffer.alloc(0);
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

function toKeyBuffer(secret) {
    if (Buffer.isBuffer(secret)) return secret;
    if (typeof secret !== 'string') return Buffer.alloc(0);
    const decoded = base32Decode(secret);
    return decoded.length > 0 ? decoded : Buffer.from(secret, 'utf8');
}

export function generateSecret(bytes = 20) {
    return base32Encode(crypto.randomBytes(bytes));
}

export function deriveCode(secret, counter) {
    const key = toKeyBuffer(secret);
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', key).update(buf).digest();
    const offset = hmac[19] & 0x0f;
    const binary = ((hmac[offset] & 0x7f) << 24)
        | ((hmac[offset + 1] & 0xff) << 16)
        | ((hmac[offset + 2] & 0xff) << 8)
        | (hmac[offset + 3] & 0xff);
    return String(binary % (10 ** DIGITS)).padStart(DIGITS, '0');
}

function purgeConsumed(nowMs) {
    const threshold = nowMs - REPLAY_WINDOW_MS;
    for (const [key, timestamp] of consumedCounters.entries()) {
        if (timestamp < threshold) consumedCounters.delete(key);
    }
}

export function verifyCode(secret, code, now = Date.now(), userId = null) {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
        return { valid: false, step: null };
    }

    const nowMs = typeof now === 'number' && now > 1e11 ? now : (typeof now === 'number' ? now * 1000 : Date.now());
    purgeConsumed(nowMs);

    const targetCode = code.trim();
    const currentStep = Math.floor(Math.floor(nowMs / 1000) / PERIOD_SECONDS);
    const inputBuf = Buffer.from(targetCode, 'utf8');

    for (const offset of [0, -1, 1]) {
        const step = currentStep + offset;
        const candidate = deriveCode(secret, step);
        const candidateBuf = Buffer.from(candidate, 'utf8');

        if (candidateBuf.length === inputBuf.length && crypto.timingSafeEqual(candidateBuf, inputBuf)) {
            if (userId) {
                const replayKey = `${userId}:${step}`;
                if (consumedCounters.has(replayKey)) {
                    return { valid: false, step: null, replayed: true };
                }
                consumedCounters.set(replayKey, nowMs);
            }
            return { valid: true, step };
        }
    }

    return { valid: false, step: null };
}

export function otpauthUri(secret, username, issuer = 'ARGUS-PR') {
    const safeUser = encodeURIComponent(username);
    const safeIssuer = encodeURIComponent(issuer);
    return `otpauth://totp/${safeIssuer}:${safeUser}?secret=${secret}&issuer=${safeIssuer}&algorithm=SHA1&digits=6&period=30`;
}

export function resetReplayCache() {
    consumedCounters.clear();
}
