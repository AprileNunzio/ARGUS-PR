import { getDatabase } from '../../storage/database.js';
import { encryptSecret, decryptSecret } from '../../security/vault.js';
import { sendMail } from '../automation/channels/smtp_client.js';
import { createLogger } from '../../kernel/logger.js';

const log = createLogger('recovery-mailer');

const HOST = /^[A-Za-z0-9._-]{1,253}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

const DEFAULTS = Object.freeze({
    enabled: false,
    host: null,
    port: 587,
    secure: false,
    startTls: true,
    username: null,
    sender: null,
    replyTo: null,
    publicUrl: null,
    hasPassword: false,
    updatedAt: null
});

function toPublic(row) {
    if (!row) return { ...DEFAULTS };

    return {
        enabled: row.enabled === 1,
        host: row.host,
        port: row.port,
        secure: row.secure === 1,
        startTls: row.start_tls === 1,
        username: row.username,
        sender: row.sender,
        replyTo: row.reply_to,
        publicUrl: row.public_url,
        hasPassword: Boolean(row.password_secret),
        updatedAt: row.updated_at
    };
}

export function readRecoveryMailer() {
    return toPublic(getDatabase().prepare('SELECT * FROM recovery_mailer WHERE id = 1').get());
}

function readSecret() {
    const row = getDatabase().prepare('SELECT password_secret FROM recovery_mailer WHERE id = 1').get();
    return row?.password_secret ? decryptSecret(row.password_secret) : '';
}

function requireHost(value) {
    const host = String(value ?? '').trim();
    if (host.length === 0) throw new Error('Indirizzo del server SMTP mancante');
    if (!HOST.test(host)) throw new Error('Indirizzo del server SMTP non valido');
    return host;
}

function requirePort(value) {
    const port = Number.parseInt(value, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta SMTP non valida');
    return port;
}

function requireEmail(value, label) {
    const email = String(value ?? '').trim().toLowerCase();
    if (email.length === 0) throw new Error(`${label} mancante`);
    if (!EMAIL.test(email)) throw new Error(`${label} non valido`);
    return email;
}

function optionalEmail(value, label) {
    const email = String(value ?? '').trim().toLowerCase();
    if (email.length === 0) return null;
    if (!EMAIL.test(email)) throw new Error(`${label} non valido`);
    return email;
}

function requirePublicUrl(value) {
    const raw = String(value ?? '').trim();
    if (raw.length === 0) return null;

    const url = new URL(raw);
    if (url.protocol !== 'https:') throw new Error('L indirizzo pubblico deve usare HTTPS');
    if (url.search.length > 0 || url.hash.length > 0) throw new Error('L indirizzo pubblico non ammette parametri');

    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

export function saveRecoveryMailer(patch) {
    const current = readRecoveryMailer();
    const enabled = patch.enabled === true;

    const next = {
        enabled: enabled ? 1 : 0,
        host: enabled ? requireHost(patch.host ?? current.host) : (patch.host ?? current.host ?? null),
        port: requirePort(patch.port ?? current.port),
        secure: patch.secure === true ? 1 : 0,
        startTls: patch.startTls === false ? 0 : 1,
        username: String(patch.username ?? current.username ?? '').trim() || null,
        sender: enabled
            ? requireEmail(patch.sender ?? current.sender, 'Indirizzo mittente')
            : optionalEmail(patch.sender ?? current.sender, 'Indirizzo mittente'),
        replyTo: optionalEmail(patch.replyTo ?? current.replyTo, 'Indirizzo di risposta'),
        publicUrl: requirePublicUrl(patch.publicUrl ?? current.publicUrl)
    };

    const secretGiven = typeof patch.password === 'string' && patch.password.length > 0;
    const secret = secretGiven ? encryptSecret(patch.password) : null;
    const now = new Date().toISOString();

    const existing = getDatabase().prepare('SELECT id FROM recovery_mailer WHERE id = 1').get();

    if (!existing) {
        getDatabase()
            .prepare(`INSERT INTO recovery_mailer (id, enabled, host, port, secure, start_tls, username, password_secret, sender, reply_to, public_url, updated_at)
                      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(next.enabled, next.host, next.port, next.secure, next.startTls, next.username, secret, next.sender, next.replyTo, next.publicUrl, now);

        return readRecoveryMailer();
    }

    const assignments = [
        'enabled = ?', 'host = ?', 'port = ?', 'secure = ?', 'start_tls = ?',
        'username = ?', 'sender = ?', 'reply_to = ?', 'public_url = ?', 'updated_at = ?'
    ];

    const values = [
        next.enabled, next.host, next.port, next.secure, next.startTls,
        next.username, next.sender, next.replyTo, next.publicUrl, now
    ];

    if (secretGiven) {
        assignments.push('password_secret = ?');
        values.push(secret);
    }

    if (patch.clearPassword === true) {
        assignments.push('password_secret = NULL');
    }

    getDatabase().prepare(`UPDATE recovery_mailer SET ${assignments.join(', ')} WHERE id = 1`).run(...values);

    return readRecoveryMailer();
}

export function recoveryMailerReady() {
    const config = readRecoveryMailer();
    return config.enabled && Boolean(config.host) && Boolean(config.sender);
}

export async function sendRecoveryMail({ to, subject, text }) {
    const config = readRecoveryMailer();
    if (!recoveryMailerReady()) throw new Error('Il server SMTP di recupero non e configurato');

    await sendMail({
        host: config.host,
        port: config.port,
        secure: config.secure,
        startTls: config.startTls,
        username: config.username ?? undefined,
        password: config.username ? readSecret() : undefined,
        from: config.sender,
        to: [to],
        subject,
        text: config.replyTo ? `${text}\n\nRisposte a: ${config.replyTo}` : text
    });

    log.info('messaggio di recupero inviato');
}

export async function testRecoveryMailer(to) {
    const target = requireEmail(to, 'Indirizzo di prova');

    await sendRecoveryMail({
        to: target,
        subject: 'ARGUS-PR: prova del server di recupero',
        text: 'Questo messaggio conferma che il server SMTP dedicato al recupero delle credenziali funziona.'
    });

    return { sent: true, to: target };
}
