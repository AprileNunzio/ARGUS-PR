import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { getDatabase } from '../../storage/database.js';
import { createLogger } from '../../kernel/logger.js';
import { revokeAllForUser } from '../../security/sessions.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { findByEmail, replacePassword, getUser } from '../users/user_repository.js';
import { normaliseEmail } from '../users/user_profile.js';
import { readDeviceIdentity } from '../system/device_identity.js';
import { sendRecoveryMail, recoveryMailerReady, readRecoveryMailer } from './recovery_mailer.js';

const log = createLogger('password-reset');

const TOKEN_BYTES = 32;
const TTL_MINUTES = 30;
const MAX_OPEN_PER_USER = 3;

function hashToken(token) {
    return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function pruneResets() {
    getDatabase()
        .prepare('DELETE FROM password_resets WHERE expires_at < ? OR used_at IS NOT NULL')
        .run(new Date().toISOString());
}

function openResets(userId) {
    return getDatabase()
        .prepare('SELECT COUNT(*) AS total FROM password_resets WHERE user_id = ? AND used_at IS NULL AND expires_at > ?')
        .get(userId, new Date().toISOString()).total;
}

function resetLink(token) {
    const config = readRecoveryMailer();
    if (!config.publicUrl) return null;
    return `${config.publicUrl}/#/recovery/${token}`;
}

function messageFor(user, token) {
    const identity = readDeviceIdentity();
    const link = resetLink(token);
    const device = identity.label ? `${identity.label} (${identity.shortId})` : identity.shortId;

    const lines = [
        `Ciao ${user.first_name ?? user.username},`,
        '',
        `qualcuno ha chiesto di reimpostare la password dell'account ${user.username} sull'impianto ARGUS-PR ${device}.`,
        '',
        link
            ? `Apri questo indirizzo entro ${TTL_MINUTES} minuti per scegliere una nuova password:\n${link}`
            : `Codice di recupero, valido ${TTL_MINUTES} minuti:\n${token}\n\nInseriscilo nella pagina di recupero dell'interfaccia.`,
        '',
        'Se non sei stato tu, ignora questo messaggio: la password resta quella di prima.',
        'Il codice a sei cifre resta comunque obbligatorio per entrare, anche dopo il recupero.'
    ];

    return lines.join('\n');
}

export async function requestReset({ email, remoteAddr }) {
    pruneResets();

    const normalised = (() => {
        try {
            return normaliseEmail(email);
        } catch {
            return null;
        }
    })();

    const outcome = { accepted: true, delivered: false };
    if (!normalised) return outcome;
    if (!recoveryMailerReady()) {
        log.warn('richiesta di recupero senza server SMTP configurato');
        return outcome;
    }

    const user = findByEmail(normalised);
    if (!user || user.is_active !== 1) return outcome;
    if (openResets(user.id) >= MAX_OPEN_PER_USER) return outcome;

    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const now = new Date();

    getDatabase()
        .prepare(`INSERT INTO password_resets (id, user_id, token_hash, issued_at, expires_at, remote_addr)
                  VALUES (?, ?, ?, ?, ?, ?)`)
        .run(
            randomUUID(),
            user.id,
            hashToken(token),
            now.toISOString(),
            new Date(now.getTime() + TTL_MINUTES * 60000).toISOString(),
            remoteAddr ?? null
        );

    await sendRecoveryMail({
        to: user.email,
        subject: 'ARGUS-PR: recupero della password',
        text: messageFor(user, token)
    }).catch((error) => {
        log.warn('invio del messaggio di recupero non riuscito', { message: error.message });
    });

    recordAudit({
        action: AuditAction.PASSWORD_CHANGED,
        actorId: user.id,
        actorName: user.username,
        target: 'password.reset.requested',
        remoteAddr,
        outcome: 'success',
        detail: { ttlMinutes: TTL_MINUTES }
    });

    return { accepted: true, delivered: true };
}

function findReset(token) {
    if (typeof token !== 'string' || token.length < 16 || token.length > 128) return null;

    const rows = getDatabase()
        .prepare('SELECT * FROM password_resets WHERE used_at IS NULL AND expires_at > ?')
        .all(new Date().toISOString());

    const wanted = Buffer.from(hashToken(token), 'hex');

    for (const row of rows) {
        const stored = Buffer.from(row.token_hash, 'hex');
        if (stored.length === wanted.length && timingSafeEqual(stored, wanted)) return row;
    }

    return null;
}

export function inspectReset(token) {
    const row = findReset(token);
    if (!row) return { valid: false };

    const user = getUser(row.user_id);
    return { valid: true, username: user?.username ?? null, expiresAt: row.expires_at };
}

export async function consumeReset({ token, password, remoteAddr }) {
    pruneResets();

    const row = findReset(token);
    if (!row) throw new Error('Il collegamento di recupero non e valido o e scaduto');

    await replacePassword(row.user_id, password, { mustChange: false });

    getDatabase()
        .prepare('UPDATE password_resets SET used_at = ? WHERE id = ?')
        .run(new Date().toISOString(), row.id);

    getDatabase()
        .prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL')
        .run(row.user_id);

    revokeAllForUser(row.user_id);

    const user = getUser(row.user_id);

    recordAudit({
        action: AuditAction.PASSWORD_CHANGED,
        actorId: row.user_id,
        actorName: user?.username,
        target: 'password.reset.completed',
        remoteAddr,
        outcome: 'success',
        detail: { sessionsRevoked: true }
    });

    log.info('password reimpostata tramite recupero', { user: user?.username });

    return { ok: true, username: user?.username ?? null };
}
