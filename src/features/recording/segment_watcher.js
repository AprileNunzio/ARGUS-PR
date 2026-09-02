import fs from 'node:fs';
import crypto from 'node:crypto';
import { appendSegment } from './segment_index.js';
import { parseSegmentStart, relativeSegmentPath, segmentPathFromName } from './segment_paths.js';
import { publish, Topic } from '../../kernel/event_bus.js';
import { createLogger } from '../../kernel/logger.js';

const log = createLogger('segment-watcher');
const POLL_MS = 4000;

function hashFile(target) {
    const hash = crypto.createHash('sha256');

    const digested = (() => {
        try {
            hash.update(fs.readFileSync(target));
            return hash.digest('hex');
        } catch {
            return null;
        }
    })();

    return digested;
}

function parseCsvLine(line) {
    const parts = line.split(',');
    if (parts.length < 3) return null;

    const start = Number.parseFloat(parts[parts.length - 2]);
    const end = Number.parseFloat(parts[parts.length - 1]);
    const file = parts.slice(0, parts.length - 2).join(',');

    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return { file, durationMs: Math.max(0, Math.round((end - start) * 1000)) };
}

export function createSegmentWatcher(config, cameraId, listingPath) {
    let consumedLines = 0;
    let timer = null;

    const drain = () => {
        const raw = (() => {
            try {
                return fs.readFileSync(listingPath, 'utf8');
            } catch {
                return '';
            }
        })();

        if (raw.length === 0) return;

        const lines = raw.split('\n').filter((line) => line.trim().length > 0);
        if (lines.length <= consumedLines) return;

        for (const line of lines.slice(consumedLines)) {
            const parsed = parseCsvLine(line.trim());
            if (!parsed) continue;

            const absolute = segmentPathFromName(config, cameraId, parsed.file);
            if (!absolute) continue;

            const stat = (() => {
                try {
                    return fs.statSync(absolute);
                } catch {
                    return null;
                }
            })();

            if (!stat || stat.size === 0) continue;

            const startedAt = parseSegmentStart(absolute) ?? stat.birthtimeMs;

            const record = {
                startedAt,
                durationMs: parsed.durationMs,
                bytes: stat.size,
                file: relativeSegmentPath(config, cameraId, absolute),
                sha256: hashFile(absolute),
                protected: false
            };

            if (appendSegment(config, cameraId, record)) {
                publish(Topic.SEGMENT_CLOSED, { cameraId, ...record });
            }
        }

        consumedLines = lines.length;
    };

    return {
        start() {
            if (timer) return;
            timer = setInterval(drain, POLL_MS);
            timer.unref();
            log.debug('watcher started', { camera: cameraId });
        },
        stop() {
            if (!timer) return;
            clearInterval(timer);
            timer = null;
            drain();
            log.debug('watcher stopped', { camera: cameraId });
        }
    };
}
