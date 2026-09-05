import { randomBytes } from 'node:crypto';
import { getDatabase } from '../../storage/database.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SHORT_ID_LENGTH = 6;

function generateShortId() {
    const bytes = randomBytes(SHORT_ID_LENGTH);
    let value = '';
    for (let index = 0; index < SHORT_ID_LENGTH; index += 1) value += ALPHABET[bytes[index] % ALPHABET.length];
    return value;
}

export function readDeviceIdentity() {
    const row = getDatabase().prepare('SELECT * FROM device_identity WHERE id = 1').get();

    if (row) return { shortId: row.short_id, label: row.label, createdAt: row.created_at };

    const shortId = generateShortId();
    const createdAt = new Date().toISOString();

    getDatabase()
        .prepare('INSERT INTO device_identity (id, short_id, label, created_at) VALUES (1, ?, NULL, ?)')
        .run(shortId, createdAt);

    return { shortId, label: null, createdAt };
}

export function renameDevice(label) {
    const text = String(label ?? '').trim();
    if (text.length > 60) throw new Error('Nome del dispositivo troppo lungo: massimo 60 caratteri');

    readDeviceIdentity();
    getDatabase().prepare('UPDATE device_identity SET label = ? WHERE id = 1').run(text.length > 0 ? text : null);

    return readDeviceIdentity();
}

export function deviceTag() {
    const identity = readDeviceIdentity();
    return identity.label ? `${identity.label} ${identity.shortId}` : identity.shortId;
}
