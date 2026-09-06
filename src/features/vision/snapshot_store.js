import { writeFileSync } from 'node:fs';
import { dirname, join, posix, sep } from 'node:path';
import { ensureDir } from '../../platform/paths.js';
import { createLogger } from '../../kernel/logger.js';

const log = createLogger('snapshot-store');

const JPEG_PREFIX = 'data:image/jpeg;base64,';
const MAX_BYTES = 2 * 1024 * 1024;

function safeSegment(value) {
    return String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
}

export function storeSnapshot(config, cameraId, dataUrl, name) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith(JPEG_PREFIX)) return null;

    const camera = safeSegment(cameraId);
    const file = safeSegment(name);
    if (!camera || !file) return null;

    const payload = Buffer.from(dataUrl.slice(JPEG_PREFIX.length), 'base64');
    if (payload.length === 0 || payload.length > MAX_BYTES) return null;

    const day = new Date().toISOString().slice(0, 10);
    const relative = posix.join('snapshots', camera, day, `${file}.jpg`);
    const absolute = join(config.mediaDir, ...relative.split('/'));

    try {
        ensureDir(dirname(absolute));
        writeFileSync(absolute, payload);
    } catch (error) {
        log.warn('snapshot not written', { cameraId: camera, error: error.message });
        return null;
    }

    return relative.split(sep).join('/');
}
