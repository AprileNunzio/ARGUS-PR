import path from 'node:path';
import fs from 'node:fs';
import { resolveInside, ensureDir } from '../../platform/paths.js';
import { validationError } from '../../kernel/errors.js';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SEGMENT_PATTERN = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.mp4$/;

export function assertCameraId(cameraId) {
    if (typeof cameraId !== 'string' || !ID_PATTERN.test(cameraId)) {
        throw validationError('Camera id has an invalid format');
    }
    return cameraId;
}

export function segmentsRoot(config) {
    return path.join(config.mediaDir, 'segments');
}

export function indexRoot(config) {
    return path.join(config.mediaDir, 'index');
}

export function cameraSegmentDir(config, cameraId) {
    assertCameraId(cameraId);
    return path.join(segmentsRoot(config), cameraId);
}

export function cameraIndexDir(config, cameraId) {
    assertCameraId(cameraId);
    return path.join(indexRoot(config), cameraId);
}

export function indexFile(config, cameraId, day) {
    return path.join(cameraIndexDir(config, cameraId), `${day}.jsonl`);
}

export function localDayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function ensureSegmentDays(config, cameraId) {
    const root = cameraSegmentDir(config, cameraId);
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86400000);

    ensureDir(path.join(root, localDayKey(today)));
    ensureDir(path.join(root, localDayKey(tomorrow)));
    return root;
}

export function segmentPattern(config, cameraId) {
    const dir = ensureSegmentDays(config, cameraId);
    return path.join(dir, '%Y-%m-%d', '%Y%m%d-%H%M%S.mp4');
}

export function listingFile(config, cameraId) {
    return path.join(ensureDir(cameraIndexDir(config, cameraId)), 'ffmpeg-segments.csv');
}

export function dayKey(date) {
    const iso = new Date(date).toISOString();
    return iso.slice(0, 10);
}

export function parseSegmentStart(fileName) {
    const match = SEGMENT_PATTERN.exec(path.basename(fileName));
    if (!match) return null;

    const [, year, month, day, hour, minute, second] = match;
    const stamp = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
    );

    return Number.isNaN(stamp.getTime()) ? null : stamp.getTime();
}

export function segmentPathFromName(config, cameraId, name) {
    const base = path.basename(name);
    const match = SEGMENT_PATTERN.exec(base);
    if (!match) return null;

    const [, year, month, day] = match;
    return path.join(cameraSegmentDir(config, cameraId), `${year}-${month}-${day}`, base);
}

export function safeSegmentPath(config, cameraId, relativePath) {
    const root = cameraSegmentDir(config, cameraId);
    const absolute = resolveInside(root, relativePath);
    if (!absolute) throw validationError('Segment path escapes the archive root');
    if (!fs.existsSync(absolute)) return null;
    return absolute;
}

export function relativeSegmentPath(config, cameraId, absolute) {
    return path.relative(cameraSegmentDir(config, cameraId), absolute).split(path.sep).join('/');
}
