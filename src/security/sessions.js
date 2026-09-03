import crypto from 'node:crypto';
import { getDatabase } from '../storage/database.js';
import { permissionsFor } from './rbac.js';

const TOKEN_BYTES = 32;

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function nowIso() {
    return new Date().toISOString();
}

export function issueSession(user, ttlHours, context = {}) {
    const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

    getDatabase()
        .prepare(`INSERT INTO sessions (id, user_id, token_hash, issued_at, expires_at, remote_addr, user_agent, zone)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
            crypto.randomUUID(),
            user.id,
            hashToken(token),
            nowIso(),
            expiresAt,
            context.remoteAddr ?? null,
            context.userAgent ?? null,
            context.zone ?? null
        );

    return { token, expiresAt };
}

export function resolveSession(token) {
    if (typeof token !== 'string' || token.length < 20) return null;

    const row = getDatabase()
        .prepare(`SELECT s.id AS session_id, s.expires_at, s.revoked_at, s.zone,
                         u.id, u.username, u.role, u.is_active, u.must_change_password
                  FROM sessions s
                  JOIN users u ON u.id = s.user_id
                  WHERE s.token_hash = ?`)
        .get(hashToken(token));

    if (!row) return null;
    if (row.revoked_at) return null;
    if (row.is_active !== 1) return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) return null;

    return {
        sessionId: row.session_id,
        id: row.id,
        username: row.username,
        role: row.role,
        issuedZone: row.zone ?? null,
        mustChangePassword: row.must_change_password === 1,
        permissions: permissionsFor(row.role)
    };
}

export function revokeSession(token) {
    if (typeof token !== 'string') return false;
    const outcome = getDatabase()
        .prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
        .run(nowIso(), hashToken(token));
    return outcome.changes > 0;
}

export function revokeAllForUser(userId) {
    return getDatabase()
        .prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
        .run(nowIso(), userId).changes;
}

export function purgeExpiredSessions() {
    return getDatabase()
        .prepare('DELETE FROM sessions WHERE expires_at < ?')
        .run(nowIso()).changes;
}
