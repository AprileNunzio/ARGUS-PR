import { getDatabase } from '../storage/database.js';
import { AppError, ErrorCode } from '../kernel/errors.js';

const SOFT_THRESHOLD = 3;
const HARD_THRESHOLD = 10;
const BASE_DELAY_SECONDS = 30;
const MAX_DELAY_SECONDS = 1800;
const HARD_LOCK_SECONDS = 3600;
const WINDOW_SECONDS = 3600;

function nowMs() {
    return Date.now();
}

function readRow(username) {
    return getDatabase()
        .prepare('SELECT username, failures, last_failure_at, locked_until FROM login_attempts WHERE username = ?')
        .get(username) ?? null;
}

function backoffSeconds(failures) {
    if (failures >= HARD_THRESHOLD) return HARD_LOCK_SECONDS;
    if (failures < SOFT_THRESHOLD) return 0;
    const steps = failures - SOFT_THRESHOLD;
    return Math.min(BASE_DELAY_SECONDS * Math.pow(2, steps), MAX_DELAY_SECONDS);
}

export function lockState(username) {
    const row = readRow(username);
    if (!row) return { locked: false, failures: 0, retryAfterSeconds: 0 };

    const lockedUntil = row.locked_until ? Date.parse(row.locked_until) : 0;
    const remainingMs = lockedUntil - nowMs();

    if (remainingMs > 0) {
        return {
            locked: true,
            failures: row.failures,
            retryAfterSeconds: Math.ceil(remainingMs / 1000)
        };
    }

    return { locked: false, failures: row.failures, retryAfterSeconds: 0 };
}

export function assertNotLocked(username) {
    const state = lockState(username);
    if (!state.locked) return state;

    throw new AppError(ErrorCode.RATE_LIMITED, 'Account temporarily locked after repeated failures', {
        details: { retryAfterSeconds: state.retryAfterSeconds }
    });
}

export function recordFailure(username) {
    const row = readRow(username);
    const stale = row && row.last_failure_at
        ? nowMs() - Date.parse(row.last_failure_at) > WINDOW_SECONDS * 1000
        : true;

    const failures = (stale ? 0 : row.failures) + 1;
    const delay = backoffSeconds(failures);
    const lockedUntil = delay > 0 ? new Date(nowMs() + delay * 1000).toISOString() : null;
    const at = new Date().toISOString();

    getDatabase()
        .prepare(`INSERT INTO login_attempts (username, failures, last_failure_at, locked_until)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(username) DO UPDATE SET
                      failures = excluded.failures,
                      last_failure_at = excluded.last_failure_at,
                      locked_until = excluded.locked_until`)
        .run(username, failures, at, lockedUntil);

    return { failures, retryAfterSeconds: delay, locked: delay > 0 };
}

export function recordSuccess(username) {
    getDatabase().prepare('DELETE FROM login_attempts WHERE username = ?').run(username);
}

export function purgeLockouts() {
    const cutoff = new Date(nowMs() - WINDOW_SECONDS * 1000).toISOString();
    return getDatabase()
        .prepare('DELETE FROM login_attempts WHERE (locked_until IS NULL OR locked_until < ?) AND last_failure_at < ?')
        .run(new Date().toISOString(), cutoff).changes;
}
