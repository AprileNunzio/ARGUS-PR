import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { indexFile, cameraIndexDir, dayKey, safeSegmentPath } from './segment_paths.js';
import { ensureDir } from '../../platform/paths.js';
import { createLogger } from '../../kernel/logger.js';

const log = createLogger('segment-index');
const GENESIS_HASH = '0'.repeat(64);

export function computeSegmentChainHash(prevHash, sha256, startedAt, cameraId) {
    return crypto
        .createHash('sha256')
        .update(`${prevHash || GENESIS_HASH}|${sha256 || ''}|${startedAt}|${cameraId}`)
        .digest('hex');
}

export function getLastDaySegment(config, cameraId, day) {
    const records = readDay(config, cameraId, day);
    return records.length > 0 ? records[records.length - 1] : null;
}

export function appendSegment(config, cameraId, record) {
    const day = dayKey(record.startedAt);
    const target = indexFile(config, cameraId, day);
    ensureDir(path.dirname(target));

    const existing = readDay(config, cameraId, day);
    let prevHash = GENESIS_HASH;
    if (existing.length > 0) {
        prevHash = existing[existing.length - 1].chainHash || GENESIS_HASH;
    } else {
        const days = listIndexedDays(config, cameraId).filter((d) => d < day);
        if (days.length > 0) {
            const lastPrevDay = days[days.length - 1];
            const lastRec = getLastDaySegment(config, cameraId, lastPrevDay);
            if (lastRec?.chainHash) prevHash = lastRec.chainHash;
        }
    }

    const chainHash = computeSegmentChainHash(prevHash, record.sha256, record.startedAt, cameraId);
    const enriched = { ...record, prevHash, chainHash };
    const line = `${JSON.stringify(enriched)}\n`;

    const written = (() => {
        try {
            fs.appendFileSync(target, line, 'utf8');
            return true;
        } catch (error) {
            log.error('index append failed', { camera: cameraId, day, message: error.message });
            return false;
        }
    })();

    return written ? enriched : null;
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

export function verifyDayIntegrity(config, cameraId, day) {
    const records = readDay(config, cameraId, day);
    if (records.length === 0) {
        return { verified: true, count: 0, checkedAt: new Date().toISOString(), day, cameraId };
    }

    const days = listIndexedDays(config, cameraId).filter((d) => d < day);
    let expectedPrev = GENESIS_HASH;
    if (days.length > 0) {
        const lastPrevDay = days[days.length - 1];
        const lastRec = getLastDaySegment(config, cameraId, lastPrevDay);
        if (lastRec?.chainHash) expectedPrev = lastRec.chainHash;
    }

    for (let i = 0; i < records.length; i++) {
        const rec = records[i];

        if (rec.prevHash !== expectedPrev) {
            return {
                verified: false,
                brokenAt: rec.file,
                index: i,
                reason: 'Chain discontinuity: prevHash does not match previous link'
            };
        }

        const expectedChain = computeSegmentChainHash(expectedPrev, rec.sha256, rec.startedAt, cameraId);
        if (rec.chainHash !== expectedChain) {
            return {
                verified: false,
                brokenAt: rec.file,
                index: i,
                reason: 'Chain hash mismatch: record metadata or hash tampered'
            };
        }

        if (!rec.pruned) {
            const diskPath = safeSegmentPath(config, cameraId, rec.file);
            if (!diskPath) {
                return {
                    verified: false,
                    brokenAt: rec.file,
                    index: i,
                    reason: 'File missing from storage but not marked as pruned'
                };
            }
            try {
                const diskSha = crypto.createHash('sha256').update(fs.readFileSync(diskPath)).digest('hex');
                if (rec.sha256 && diskSha !== rec.sha256) {
                    return {
                        verified: false,
                        brokenAt: rec.file,
                        index: i,
                        reason: 'File content hash mismatch: disk file tampered'
                    };
                }
            } catch (err) {
                return {
                    verified: false,
                    brokenAt: rec.file,
                    index: i,
                    reason: `Cannot read file for hash check: ${err.message}`
                };
            }
        }

        expectedPrev = rec.chainHash;
    }

    return {
        verified: true,
        count: records.length,
        day,
        cameraId,
        checkedAt: new Date().toISOString()
    };
}
