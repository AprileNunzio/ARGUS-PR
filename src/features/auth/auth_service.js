import crypto from 'node:crypto';
import { getDatabase } from '../../storage/database.js';
import { hashPassword, verifyPassword, assessPassword, generatePassword } from '../../security/password.js';
import { issueSession, revokeSession, revokeAllForUser } from '../../security/sessions.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { Role, roleExists } from '../../security/rbac.js';
import { validationError, unauthenticated, notFound } from '../../kernel/errors.js';
import { createLogger } from '../../kernel/logger.js';

const log = createLogger('auth');

function nowIso() {
    return new Date().toISOString();
}

export function countUsers() {
    return getDatabase().prepare('SELECT COUNT(*) AS total FROM users').get().total;
}

export function findByUsername(username) {
    return getDatabase().prepare('SELECT * FROM users WHERE username = ?').get(username) ?? null;
}

export async function createUser({ username, password, role, mustChangePassword = false }) {
    if (!roleExists(role)) throw validationError(`Unknown role: ${role}`);

    const problems = assessPassword(password);
    if (problems.length > 0) throw validationError('Password is too weak', { problems });

    if (findByUsername(username)) throw validationError('Username already exists');

    const id = crypto.randomUUID();
    getDatabase()
        .prepare(`INSERT INTO users (id, username, password_hash, role, is_active, must_change_password, created_at)
                  VALUES (?, ?, ?, ?, 1, ?, ?)`)
        .run(id, username, await hashPassword(password), role, mustChangePassword ? 1 : 0, nowIso());

    return { id, username, role };
}

export async function ensureBootstrapAdmin() {
    if (countUsers() > 0) return null;

    const password = generatePassword(20);
    await createUser({ username: 'admin', password, role: Role.ADMIN, mustChangePassword: true });
    log.warn('bootstrap admin created', { username: 'admin' });

    return { username: 'admin', password };
}

export async function login({ username, password, remoteAddr, userAgent, ttlHours }) {
    const user = findByUsername(username);
    const stored = user?.password_hash ?? '$scrypt$0$0$0$0$0';
    const matches = await verifyPassword(password, stored);

    if (!user || !matches || user.is_active !== 1) {
        recordAudit({
            action: AuditAction.LOGIN_FAILURE,
            actorName: username,
            remoteAddr,
            outcome: 'failure'
        });
        throw unauthenticated('Invalid username or password');
    }

    const session = issueSession(user, ttlHours, { remoteAddr, userAgent });

    getDatabase().prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id);

    recordAudit({
        action: AuditAction.LOGIN_SUCCESS,
        actorId: user.id,
        actorName: user.username,
        remoteAddr,
        outcome: 'success'
    });

    return {
        session,
        profile: {
            username: user.username,
            role: user.role,
            mustChangePassword: user.must_change_password === 1
        }
    };
}

export function logout(token, actor, remoteAddr) {
    const revoked = revokeSession(token);
    if (revoked && actor) {
        recordAudit({
            action: AuditAction.LOGOUT,
            actorId: actor.id,
            actorName: actor.username,
            remoteAddr,
            outcome: 'success'
        });
    }
    return revoked;
}

export async function changePassword({ actor, currentPassword, newPassword, remoteAddr }) {
    const user = getDatabase().prepare('SELECT * FROM users WHERE id = ?').get(actor.id);
    if (!user) throw notFound('User');

    const matches = await verifyPassword(currentPassword, user.password_hash);
    if (!matches) throw unauthenticated('Current password is incorrect');

    const problems = assessPassword(newPassword);
    if (problems.length > 0) throw validationError('Password is too weak', { problems });

    getDatabase()
        .prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
        .run(await hashPassword(newPassword), user.id);

    revokeAllForUser(user.id);

    recordAudit({
        action: AuditAction.PASSWORD_CHANGED,
        actorId: user.id,
        actorName: user.username,
        remoteAddr,
        outcome: 'success'
    });

    return true;
}
