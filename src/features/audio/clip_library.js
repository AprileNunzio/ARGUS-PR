import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getDatabase } from '../../storage/database.js';

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = Object.freeze({
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/wave': '.wav',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/opus': '.opus',
    'audio/flac': '.flac'
});

let clipDir = null;

export function initClipLibrary(config) {
    clipDir = path.join(config.dataDir, 'audio');
    mkdirSync(clipDir, { recursive: true });
    return clipDir;
}

export function clipDirectory() {
    if (!clipDir) throw new Error('Libreria audio non inizializzata');
    return clipDir;
}

function toPublic(row) {
    if (!row) return null;

    return {
        id: row.id,
        name: row.name,
        description: row.description,
        byteSize: row.byte_size,
        durationMs: row.duration_ms,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

export function listClips() {
    return getDatabase().prepare('SELECT * FROM audio_clips ORDER BY name').all().map(toPublic);
}

export function getClip(id) {
    return toPublic(getDatabase().prepare('SELECT * FROM audio_clips WHERE id = ?').get(id));
}

export function clipPath(id) {
    const row = getDatabase().prepare('SELECT file_name FROM audio_clips WHERE id = ?').get(id);
    if (!row) return null;

    const resolved = path.resolve(clipDirectory(), row.file_name);
    if (!resolved.startsWith(path.resolve(clipDirectory()) + path.sep)) return null;
    return existsSync(resolved) ? resolved : null;
}

export function extensionFor(contentType) {
    return ALLOWED[String(contentType ?? '').split(';')[0].trim().toLowerCase()] ?? null;
}

export function saveClip({ name, description, contentType, data }) {
    const label = String(name ?? '').trim();
    if (label.length === 0 || label.length > 80) throw new Error('Nome della clip non valido');

    const extension = extensionFor(contentType);
    if (!extension) throw new Error('Formato audio non ammesso: usa WAV, MP3, OGG, Opus o FLAC');

    if (!Buffer.isBuffer(data) || data.length === 0) throw new Error('File audio vuoto');
    if (data.length > MAX_BYTES) throw new Error('La clip supera i quattro megabyte');

    const id = randomUUID();
    const fileName = `${id}${extension}`;
    writeFileSync(path.join(clipDirectory(), fileName), data, { mode: 0o640 });

    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO audio_clips (id, name, description, file_name, byte_size, duration_ms, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, 0, ?, ?)`)
        .run(id, label, String(description ?? '').slice(0, 300) || null, fileName, data.length, now, now);

    return getClip(id);
}

export function renameClip(id, { name, description }) {
    const existing = getClip(id);
    if (!existing) return null;

    const label = String(name ?? existing.name).trim();
    if (label.length === 0 || label.length > 80) throw new Error('Nome della clip non valido');

    getDatabase()
        .prepare('UPDATE audio_clips SET name = ?, description = ?, updated_at = ? WHERE id = ?')
        .run(label, String(description ?? existing.description ?? '').slice(0, 300) || null, new Date().toISOString(), id);

    return getClip(id);
}

export function deleteClip(id) {
    const target = clipPath(id);
    const removed = getDatabase().prepare('DELETE FROM audio_clips WHERE id = ?').run(id).changes > 0;
    if (removed && target) rmSync(target, { force: true });
    return removed;
}
