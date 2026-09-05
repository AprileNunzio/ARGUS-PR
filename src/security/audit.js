import crypto from 'node:crypto';
import { getDatabase } from '../storage/database.js';
import { sanitiseForLog } from './guards.js';

export const AuditAction = Object.freeze({
    LOGIN_SUCCESS: 'auth.login.success',
    LOGIN_FAILURE: 'auth.login.failure',
    LOGOUT: 'auth.logout',
    PASSWORD_CHANGED: 'auth.password.changed',
    CAMERA_CREATED: 'camera.created',
    CAMERA_UPDATED: 'camera.updated',
    CAMERA_DELETED: 'camera.deleted',
    DISCOVERY_RUN: 'discovery.run',
    ARCHIVE_VIEWED: 'archive.viewed',
    ARCHIVE_EXPORTED: 'archive.exported',
    SETTINGS_CHANGED: 'settings.changed',
    MFA_ENABLED: 'mfa.enabled',
    MFA_DISABLED: 'mfa.disabled',
    BARRIER_TRIGGERED: 'barrier.triggered',
    GATE_OPENED: 'gate.opened',
    PTZ_MOVED: 'ptz.moved'
});

export function computeAuditHash(prevHash, at, actorId, actorName, action, target, remoteAddr, outcome, detail) {
    const payload = [
        prevHash ?? '0'.repeat(64),
        at ?? '',
        actorId ?? '',
        actorName ?? '',
        action ?? '',
        target ?? '',
        remoteAddr ?? '',
        outcome ?? '',
        detail ?? ''
    ].join('|');
    return crypto.createHash('sha256').update(payload).digest('hex');
}

export function recordAudit(entry) {
    const db = getDatabase();
    const at = new Date().toISOString();
    const actorId = entry.actorId ?? null;
    const actorName = sanitiseForLog(entry.actorName ?? null);
    const action = entry.action;
    const target = sanitiseForLog(entry.target ?? null);
    const remoteAddr = sanitiseForLog(entry.remoteAddr ?? null);
    const outcome = entry.outcome ?? 'success';
    const detail = entry.detail ? JSON.stringify(entry.detail).slice(0, 2000) : null;

    const run = db.transaction(() => {
        const last = db.prepare('SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
        const prevHash = last?.entry_hash ?? '0'.repeat(64);
        const entryHash = computeAuditHash(prevHash, at, actorId, actorName, action, target, remoteAddr, outcome, detail);

        db.prepare(`INSERT INTO audit_log (at, actor_id, actor_name, action, target, remote_addr, outcome, detail, prev_hash, entry_hash)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            at, actorId, actorName, action, target, remoteAddr, outcome, detail, prevHash, entryHash
        );
        return entryHash;
    });

    return run();
}

export function verifyAuditIntegrity() {
    const rows = getDatabase().prepare('SELECT * FROM audit_log ORDER BY id ASC').all();
    let expectedPrevHash = '0'.repeat(64);

    for (const row of rows) {
        if (row.prev_hash !== expectedPrevHash) {
            return { verified: false, count: rows.length, brokenAt: row.id, reason: 'prev_hash mismatch' };
        }
        const calculated = computeAuditHash(
            row.prev_hash,
            row.at,
            row.actor_id,
            row.actor_name,
            row.action,
            row.target,
            row.remote_addr,
            row.outcome,
            row.detail
        );
        if (calculated !== row.entry_hash) {
            return { verified: false, count: rows.length, brokenAt: row.id, reason: 'entry_hash mismatch' };
        }
        expectedPrevHash = row.entry_hash;
    }

    return { verified: true, count: rows.length, brokenAt: null };
}

export function queryAudit(filters = {}) {
    const limit = Math.min(Math.max(Number.parseInt(filters.limit, 10) || 100, 1), 500);
    const clauses = [];
    const params = [];

    if (filters.action) {
        clauses.push('action = ?');
        params.push(filters.action);
    }
    if (filters.actorId) {
        clauses.push('actor_id = ?');
        params.push(filters.actorId);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    return getDatabase()
        .prepare(`SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT ?`)
        .all(...params, limit);
}
