import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const PARAMS = Object.freeze({ N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

export const PASSWORD_MIN_LENGTH = 12;

export function assessPassword(password) {
    const problems = [];
    if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
        problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters`);
    }
    if (typeof password === 'string') {
        if (!/[a-z]/.test(password)) problems.push('Add a lowercase letter');
        if (!/[A-Z]/.test(password)) problems.push('Add an uppercase letter');
        if (!/[0-9]/.test(password)) problems.push('Add a digit');
    }
    return problems;
}

export async function hashPassword(password) {
    const salt = crypto.randomBytes(SALT_BYTES);
    const derived = await scrypt(password, salt, KEY_BYTES, PARAMS);
    return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
    if (typeof stored !== 'string') return false;

    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const N = Number.parseInt(parts[1], 10);
    const r = Number.parseInt(parts[2], 10);
    const p = Number.parseInt(parts[3], 10);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

    const salt = Buffer.from(parts[4], 'base64');
    const expected = Buffer.from(parts[5], 'base64');

    const derived = await scrypt(password, salt, expected.length, { N, r, p, maxmem: PARAMS.maxmem })
        .catch(() => null);

    if (!derived || derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
}

export function generatePassword(length = 20) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = crypto.randomBytes(length);
    let output = '';
    for (let index = 0; index < length; index += 1) {
        output += alphabet[bytes[index] % alphabet.length];
    }
    return output;
}
