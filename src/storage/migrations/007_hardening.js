export default {
    version: 7,
    name: 'hardening',
    sql: `
CREATE TABLE IF NOT EXISTS login_attempts (
    username TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    last_failure_at TEXT,
    locked_until TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_locked ON login_attempts (locked_until);

ALTER TABLE sessions ADD COLUMN zone TEXT;
`
};
