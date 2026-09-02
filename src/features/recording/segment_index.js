import fs from 'node:fs';
import path from 'node:path';
import { indexFile, cameraIndexDir, dayKey } from './segment_paths.js';
import { ensureDir } from '../../platform/paths.js';
import { createLogger } from '../../kernel/logger.js';

const log = createLogger('segment-index');

export function appendSegment(config, cameraId, record) {
    const day = dayKey(record.startedAt);
    const target = indexFile(config, cameraId, day);
    ensureDir(path.dirname(target));

    const line = `${JSON.stringify(record)}\n`;

    const written = (() => {
        try {
            fs.appendFileSync(target, line, 'utf8');
            return true;
        } catch (error) {
            log.error('index append failed', { camera: cameraId, day, message: error.message });
            return false;
        }
    })();

    return written;
}

function readDay(config, cameraId, day) {
    const target = indexFile(config, cameraId, day);

    const raw = (() => {
        try {
            return fs.readFileSync(target, 'utf8');
        } catch {
            return '';
        }
    })();

    if (raw.length === 0) return [];

    const records = [];
    for (const line of raw.split('\n')) {
        if (line.length === 0) continue;
        const parsed = (() => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        })();
        if (parsed) records.push(parsed);
    }
    return records;
}

function daysBetween(fromMs, toMs) {
    const days = [];
    const cursor = new Date(fromMs);
    cursor.setUTCHours(0, 0, 0, 0);

    while (cursor.getTime() <= toMs) {
        days.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
}

export function querySegments(config, cameraId, fromMs, toMs) {
    const results = [];

    for (const day of daysBetween(fromMs, toMs)) {
        for (const record of readDay(config, cameraId, day)) {
            const start = record.startedAt;
            const end = record.startedAt + record.durationMs;
            if (end < fromMs || start > toMs) continue;
            results.push(record);
        }
    }

    return results.sort((a, b) => a.startedAt - b.startedAt);
}

export function listIndexedDays(config, cameraId) {
    const dir = cameraIndexDir(config, cameraId);

    const entries = (() => {
        try {
            return fs.readdirSync(dir);
        } catch {
            return [];
        }
    })();

    return entries
        .filter((name) => name.endsWith('.jsonl'))
        .map((name) => name.replace('.jsonl', ''))
        .sort();
}

export function rewriteDay(config, cameraId, day, records) {
    const target = indexFile(config, cameraId, day);
    const body = records.map((record) => JSON.stringify(record)).join('\n');
    const payload = body.length > 0 ? `${body}\n` : '';
    const temporary = `${target}.tmp`;

    const done = (() => {
        try {
            fs.writeFileSync(temporary, payload, 'utf8');
            fs.renameSync(temporary, target);
            return true;
        } catch (error) {
            log.error('index rewrite failed', { camera: cameraId, day, message: error.message });
            return false;
        }
    })();

    return done;
}

export function readDayRecords(config, cameraId, day) {
    return readDay(config, cameraId, day);
}
