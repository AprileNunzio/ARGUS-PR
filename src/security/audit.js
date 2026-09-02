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
    SETTINGS_CHANGED: 'settings.changed'
});

export function recordAudit(entry) {
    getDatabase()
        .prepare(`INSERT INTO audit_log (at, actor_id, actor_name, action, target, remote_addr, outcome, detail)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
            new Date().toISOString(),
            entry.actorId ?? null,
            sanitiseForLog(entry.actorName ?? null),
            entry.action,
            sanitiseForLog(entry.target ?? null),
            sanitiseForLog(entry.remoteAddr ?? null),
            entry.outcome ?? 'success',
            entry.detail ? JSON.stringify(entry.detail).slice(0, 2000) : null
        );
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
