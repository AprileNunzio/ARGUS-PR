import { createLogger } from '../../kernel/logger.js';
import { on, Topic } from '../../kernel/event_bus.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { getDatabase } from '../../storage/database.js';

const log = createLogger('shortfall-watchdog');

const lastSegments = new Map();
const shortfalls = new Map();

export function recordSegmentArrival(cameraId, record, nominalDurationMs = 60000) {
    const now = record.startedAt || Date.now();
    const prev = lastSegments.get(cameraId);
    lastSegments.set(cameraId, { at: now, durationMs: record.durationMs });

    if (!prev) return null;

    const gap = now - (prev.at + prev.durationMs);
    const tolerance = 5000;

    if (gap > tolerance) {
        const shortfall = {
            cameraId,
            gapMs: gap,
            gapSeconds: Math.round(gap / 1000),
            expectedAt: prev.at + prev.durationMs,
            resumedAt: now,
            detectedAt: new Date().toISOString()
        };

        shortfalls.set(cameraId, shortfall);
        log.warn('video segment shortfall detected', shortfall);

        try {
            recordAudit(getDatabase(), {
                action: 'archive.shortfall_detected',
                target: cameraId,
                outcome: 'warning',
                detail: shortfall
            });
        } catch {}

        return shortfall;
    }

    return null;
}

export function getCameraShortfall(cameraId) {
    return shortfalls.get(cameraId) || null;
}

export function listShortfalls() {
    return Array.from(shortfalls.values());
}
