import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../kernel/logger.js';

const log = createLogger('security-events');

const MAX_BYTES = 8 * 1024 * 1024;

export const SecurityEvent = Object.freeze({
    AUTH_FAILURE: 'auth.failure',
    AUTH_SUCCESS: 'auth.success',
    AUTH_LOCKED: 'auth.locked',
    ADMIN_FROM_WAN: 'auth.admin_from_wan',
    ZONE_DENIED: 'zone.denied',
    ORIGIN_REJECTED: 'origin.rejected',
    RATE_LIMITED: 'rate.limited',
    PROBE: 'route.probe'
});

const WEIGHTS = Object.freeze({
    [SecurityEvent.AUTH_FAILURE]: 3,
    [SecurityEvent.AUTH_SUCCESS]: 0,
    [SecurityEvent.AUTH_LOCKED]: 6,
    [SecurityEvent.ADMIN_FROM_WAN]: 10,
    [SecurityEvent.ZONE_DENIED]: 5,
    [SecurityEvent.ORIGIN_REJECTED]: 4,
    [SecurityEvent.RATE_LIMITED]: 2,
    [SecurityEvent.PROBE]: 2
});

let target = null;
let written = 0;

export function initSecurityEvents(config) {
    target = path.join(config.dataDir, 'security-events.jsonl');

    try {
        written = fs.existsSync(target) ? fs.statSync(target).size : 0;
        if (!fs.existsSync(target)) fs.writeFileSync(target, '', { mode: 0o640 });
        if (process.platform !== 'win32') fs.chmodSync(target, 0o640);
    } catch (error) {
        log.error('cannot open the security event stream', { file: target, message: error.message });
        target = null;
    }

    return target;
}

function rotate() {
    try {
        fs.renameSync(target, target + '.1');
        written = 0;
    } catch (error) {
        log.warn('rotation failed', { message: error.message });
    }
}

export function emitSecurityEvent(kind, details = {}) {
    if (!target) return;

    const line = JSON.stringify({
        at: new Date().toISOString(),
        kind,
        weight: WEIGHTS[kind] ?? 1,
        address: details.address ?? null,
        zone: details.zone ?? null,
        username: details.username ?? null,
        method: details.method ?? null,
        path: details.path ?? null,
        detail: details.detail ?? null
    }) + '\n';

    try {
        fs.appendFileSync(target, line);
        written += line.length;
        if (written > MAX_BYTES) rotate();
    } catch (error) {
        log.warn('cannot append a security event', { message: error.message });
    }
}

export function securityEventFile() {
    return target;
}
