export default {
    version: 15,
    name: 'user_profiles',
    sql: `
ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN birth_date TEXT;
ALTER TABLE users ADD COLUMN birth_place TEXT;
ALTER TABLE users ADD COLUMN tax_code TEXT;
ALTER TABLE users ADD COLUMN address TEXT;
ALTER TABLE users ADD COLUMN city TEXT;
ALTER TABLE users ADD COLUMN province TEXT;
ALTER TABLE users ADD COLUMN postal_code TEXT;
ALTER TABLE users ADD COLUMN country TEXT;
ALTER TABLE users ADD COLUMN job_title TEXT;
ALTER TABLE users ADD COLUMN department TEXT;
ALTER TABLE users ADD COLUMN emergency_contact TEXT;
ALTER TABLE users ADD COLUMN emergency_phone TEXT;
ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'it';
ALTER TABLE users ADD COLUMN notify_email INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notify_alarm INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notify_system INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN notify_digest INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN notes TEXT;
ALTER TABLE users ADD COLUMN updated_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    issued_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    remote_addr TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_expiry ON password_resets(expires_at);

CREATE TABLE IF NOT EXISTS recovery_mailer (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    host TEXT,
    port INTEGER NOT NULL DEFAULT 587,
    secure INTEGER NOT NULL DEFAULT 0,
    start_tls INTEGER NOT NULL DEFAULT 1,
    username TEXT,
    password_secret TEXT,
    sender TEXT,
    reply_to TEXT,
    public_url TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_identity (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    short_id TEXT NOT NULL,
    label TEXT,
    created_at TEXT NOT NULL
);
`
};
