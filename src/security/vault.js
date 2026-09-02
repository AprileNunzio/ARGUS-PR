import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { internal } from '../kernel/errors.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

let masterKey = null;

function keyFile(config) {
    return path.join(config.secretsDir, 'master.key');
}

function createKey(target) {
    const key = crypto.randomBytes(KEY_BYTES);
    fs.writeFileSync(target, key, { mode: 0o600 });
    if (process.platform !== 'win32') fs.chmodSync(target, 0o600);
    return key;
}

export function initVault(config) {
    const target = keyFile(config);

    masterKey = (() => {
        try {
            if (!fs.existsSync(target)) return createKey(target);
            const existing = fs.readFileSync(target);
            if (existing.length !== KEY_BYTES) {
                throw internal('Master key file is corrupt. Restore it from backup or re-enrol camera credentials.');
            }
            return existing;
        } catch (error) {
            throw internal(`Cannot initialise vault at ${target}`, error);
        }
    })();

    return { keyPath: target };
}

function requireKey() {
    if (!masterKey) throw internal('Vault used before initialisation');
    return masterKey;
}

export function deriveKey(purpose) {
    return crypto.hkdfSync('sha256', requireKey(), Buffer.alloc(0), Buffer.from(purpose, 'utf8'), KEY_BYTES);
}

export function encryptSecret(plaintext) {
    if (typeof plaintext !== 'string' || plaintext.length === 0) return null;

    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, requireKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptSecret(payload) {
    if (typeof payload !== 'string' || payload.length === 0) return null;

    const raw = Buffer.from(payload, 'base64');
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;

    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const body = raw.subarray(IV_BYTES + TAG_BYTES);

    const decipher = crypto.createDecipheriv(ALGORITHM, requireKey(), iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
