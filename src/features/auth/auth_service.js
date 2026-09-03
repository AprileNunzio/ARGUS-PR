import crypto from 'node:crypto';
import { getDatabase } from '../../storage/database.js';
import { hashPassword, verifyPassword, assessPassword, generatePassword } from '../../security/password.js';
import { issueSession, revokeSession, revokeAllForUser } from '../../security/sessions.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { Role, roleExists, can, Permission } from '../../security/rbac.js';
import { assertNotLocked, recordFailure, recordSuccess } from '../../security/lockout.js';
import { lockoutThresholds, mfaRequiredForAdmin } from '../settings/settings_service.js';
import { emitSecurityEvent, SecurityEvent } from '../../security/security_events.js';
import { Zone } from '../../security/net_zones.js';
import { validationError, unauthenticated, notFound, conflict, forbidden } from '../../kernel/errors.js';
import { createLogger } from '../../kernel/logger.js';
import { generateSecret, verifyCode, otpauthUri } from '../../security/totp.js';
import { encryptSecret, decryptSecret } from '../../security/vault.js';

const log = createLogger('auth');
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const pendingChallenges = new Map();

function nowIso() {
    return new Date().toISOString();
}

function purgeExpiredChallenges() {
    const now = Date.now();
    for (const [challenge, entry] of pendingChallenges.entries()) {
        if (entry.expiresAt < now) pendingChallenges.delete(challenge);
    }
}

export function clearPendingChallenges() {
    pendingChallenges.clear();
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

export async function login({ username, password, remoteAddr, userAgent, ttlHours, zone = Zone.LAN }) {
    assertNotLocked(username);

    const user = findByUsername(username);
    const stored = user?.password_hash ?? '$scrypt$0$0$0$0$0';
    const matches = await verifyPassword(password, stored);

    if (!user || !matches || user.is_active !== 1) {
        const outcome = recordFailure(username, lockoutThresholds());

        recordAudit({
            action: AuditAction.LOGIN_FAILURE,
            actorName: username,
            remoteAddr,
            outcome: 'failure'
        });

        emitSecurityEvent(outcome.locked ? SecurityEvent.AUTH_LOCKED : SecurityEvent.AUTH_FAILURE, {
            address: remoteAddr,
            zone,
            username,
            detail: `failures=${outcome.failures}`
        });

        throw unauthenticated('Invalid username or password');
    }

    if (zone === Zone.WAN && can(user.role, Permission.SYSTEM_MANAGE)) {
        recordFailure(username, lockoutThresholds());

        recordAudit({
            action: AuditAction.LOGIN_FAILURE,
            actorId: user.id,
            actorName: user.username,
            remoteAddr,
            outcome: 'failure'
        });

        emitSecurityEvent(SecurityEvent.ADMIN_FROM_WAN, { address: remoteAddr, zone, username: user.username });

        throw unauthenticated('Invalid username or password');
    }

    if (user.totp_enabled === 1) {
        purgeExpiredChallenges();
        const challenge = crypto.randomBytes(32).toString('base64url');
        pendingChallenges.set(challenge, {
            userId: user.id,
            username: user.username,
            remoteAddr,
            userAgent,
            ttlHours,
            zone,
            expiresAt: Date.now() + CHALLENGE_TTL_MS
        });

        return {
            mfaRequired: true,
            challenge,
            profile: {
                username: user.username,
                role: user.role,
                mustChangePassword: user.must_change_password === 1
            }
        };
    }

    recordSuccess(username);

    const session = issueSession(user, ttlHours, { remoteAddr, userAgent, zone });

    getDatabase().prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id);

    recordAudit({
        action: AuditAction.LOGIN_SUCCESS,
        actorId: user.id,
        actorName: user.username,
        remoteAddr,
        outcome: 'success'
    });

    emitSecurityEvent(SecurityEvent.AUTH_SUCCESS, { address: remoteAddr, zone, username: user.username });

    return {
        session,
        profile: {
            username: user.username,
            role: user.role,
            mustChangePassword: user.must_change_password === 1
        }
    };
}

export async function verifyMfaLogin({ challenge, code, remoteAddr, zone = Zone.LAN }) {
    purgeExpiredChallenges();

    const entry = pendingChallenges.get(challenge);
    if (!entry || entry.expiresAt < Date.now()) {
        throw unauthenticated('MFA challenge expired or invalid');
    }

    assertNotLocked(entry.username);

    if (zone !== entry.zone) {
        recordFailure(entry.username, lockoutThresholds());
        throw unauthenticated('Zone mismatch during authentication');
    }

    const user = getDatabase().prepare('SELECT * FROM users WHERE id = ?').get(entry.userId);
    if (!user || user.is_active !== 1 || user.totp_enabled !== 1) {
        throw unauthenticated('Invalid user or MFA not enabled');
    }

    if (zone === Zone.WAN && can(user.role, Permission.SYSTEM_MANAGE)) {
        recordFailure(entry.username, lockoutThresholds());
        emitSecurityEvent(SecurityEvent.ADMIN_FROM_WAN, { address: remoteAddr, zone, username: user.username });
        throw unauthenticated('Invalid username or password');
    }

    const targetCode = String(code ?? '').trim();
    let verified = false;

    if (/^\d{6}$/.test(targetCode)) {
        const secret = decryptSecret(user.totp_secret);
        if (secret) {
            const outcome = verifyCode(secret, targetCode, Date.now(), user.id);
            if (outcome.valid) verified = true;
        }
    }

    if (!verified && targetCode.length > 0) {
        const recoveryRows = getDatabase()
            .prepare('SELECT id, code_hash FROM recovery_codes WHERE user_id = ? AND used_at IS NULL')
            .all(user.id);

        for (const row of recoveryRows) {
            if (await verifyPassword(targetCode, row.code_hash)) {
                getDatabase()
                    .prepare('UPDATE recovery_codes SET used_at = ? WHERE id = ?')
                    .run(nowIso(), row.id);
                verified = true;
                break;
            }
        }
    }

    if (!verified) {
        const outcome = recordFailure(entry.username, lockoutThresholds());

        recordAudit({
            action: AuditAction.LOGIN_FAILURE,
            actorId: user.id,
            actorName: user.username,
            remoteAddr,
            outcome: 'failure',
            detail: { reason: 'invalid_mfa_code' }
        });

        emitSecurityEvent(outcome.locked ? SecurityEvent.AUTH_LOCKED : SecurityEvent.AUTH_FAILURE, {
            address: remoteAddr,
            zone,
            username: user.username,
            detail: `mfa_failures=${outcome.failures}`
        });

        throw unauthenticated('Invalid authentication code');
    }

    pendingChallenges.delete(challenge);
    recordSuccess(entry.username);

    const session = issueSession(user, entry.ttlHours, {
        remoteAddr: entry.remoteAddr,
        userAgent: entry.userAgent,
        zone: entry.zone
    });

    getDatabase().prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id);

    recordAudit({
        action: AuditAction.LOGIN_SUCCESS,
        actorId: user.id,
        actorName: user.username,
        remoteAddr,
        outcome: 'success'
    });

    emitSecurityEvent(SecurityEvent.AUTH_SUCCESS, { address: remoteAddr, zone, username: user.username });

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

export async function setupMfa(actorId) {
    const user = getDatabase().prepare('SELECT id, username, totp_enabled FROM users WHERE id = ?').get(actorId);
    if (!user) throw notFound('User');

    if (user.totp_enabled === 1) {
        throw conflict('MFA is already enabled. Disable it before setting up a new secret.');
    }

    const secret = generateSecret();
    const encrypted = encryptSecret(secret);

    getDatabase()
        .prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?')
        .run(encrypted, user.id);

    return {
        secret,
        uri: otpauthUri(secret, user.username, 'ARGUS-PR')
    };
}

export async function confirmMfa(actorId, code) {
    const user = getDatabase().prepare('SELECT id, username, totp_secret, totp_enabled FROM users WHERE id = ?').get(actorId);
    if (!user) throw notFound('User');

    if (user.totp_enabled === 1) {
        throw conflict('MFA is already confirmed and active');
    }

    if (!user.totp_secret) {
        throw validationError('MFA setup has not been initiated');
    }

    const targetCode = String(code ?? '').trim();
    const secret = decryptSecret(user.totp_secret);
    if (!secret) throw validationError('Cannot decrypt TOTP secret');

    const outcome = verifyCode(secret, targetCode, Date.now(), user.id);
    if (!outcome.valid) {
        throw validationError('Invalid verification code');
    }

    const recoveryCodes = [];
    for (let i = 0; i < 10; i++) {
        recoveryCodes.push(crypto.randomBytes(5).toString('hex'));
    }

    getDatabase().prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(user.id);

    for (const item of recoveryCodes) {
        const hash = await hashPassword(item);
        getDatabase()
            .prepare(`INSERT INTO recovery_codes (id, user_id, code_hash, created_at)
                      VALUES (?, ?, ?, ?)`)
            .run(crypto.randomUUID(), user.id, hash, nowIso());
    }

    getDatabase()
        .prepare('UPDATE users SET totp_enabled = 1, totp_confirmed_at = ? WHERE id = ?')
        .run(nowIso(), user.id);

    recordAudit({
        action: AuditAction.MFA_ENABLED,
        actorId: user.id,
        actorName: user.username,
        outcome: 'success'
    });

    return { ok: true, recoveryCodes };
}

export async function disableMfa(actor, { password, code }) {
    if (actor.role === Role.ADMIN && mfaRequiredForAdmin()) {
        throw forbidden('MFA cannot be disabled for administrative accounts');
    }

    const user = getDatabase().prepare('SELECT * FROM users WHERE id = ?').get(actor.id);
    if (!user) throw notFound('User');

    const matches = await verifyPassword(password, user.password_hash);
    if (!matches) throw unauthenticated('Current password is incorrect');

    const targetCode = String(code ?? '').trim();
    let verified = false;

    if (/^\d{6}$/.test(targetCode)) {
        const secret = decryptSecret(user.totp_secret);
        if (secret) {
            const outcome = verifyCode(secret, targetCode, Date.now(), user.id);
            if (outcome.valid) verified = true;
        }
    }

    if (!verified && targetCode.length > 0) {
        const recoveryRows = getDatabase()
            .prepare('SELECT id, code_hash FROM recovery_codes WHERE user_id = ? AND used_at IS NULL')
            .all(user.id);

        for (const row of recoveryRows) {
            if (await verifyPassword(targetCode, row.code_hash)) {
                getDatabase()
                    .prepare('UPDATE recovery_codes SET used_at = ? WHERE id = ?')
                    .run(nowIso(), row.id);
                verified = true;
                break;
            }
        }
    }

    if (!verified) throw validationError('Invalid verification code');

    getDatabase()
        .prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_confirmed_at = NULL WHERE id = ?')
        .run(user.id);

    getDatabase().prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(user.id);

    recordAudit({
        action: AuditAction.MFA_DISABLED,
        actorId: user.id,
        actorName: user.username,
        outcome: 'success'
    });

    return { ok: true };
}

export function getMfaStatus(actorId) {
    const user = getDatabase().prepare('SELECT totp_enabled, totp_confirmed_at FROM users WHERE id = ?').get(actorId);
    if (!user) throw notFound('User');
    return {
        enabled: user.totp_enabled === 1,
        confirmedAt: user.totp_confirmed_at ?? null
    };
}
