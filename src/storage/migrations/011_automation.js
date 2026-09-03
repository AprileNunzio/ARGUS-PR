export default {
    version: 11,
    name: 'automation',
    sql: `
CREATE TABLE IF NOT EXISTS automation_channels (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    config TEXT NOT NULL,
    secret TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    trigger_kind TEXT NOT NULL,
    camera_id TEXT,
    class_name TEXT,
    min_confidence REAL NOT NULL DEFAULT 0,
    plate_scope TEXT NOT NULL DEFAULT 'any',
    person_scope TEXT NOT NULL DEFAULT 'any',
    week_mask TEXT,
    cooldown_seconds INTEGER NOT NULL DEFAULT 60,
    daily_limit INTEGER,
    actions TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_enabled ON automation_rules(enabled, trigger_kind);

CREATE TABLE IF NOT EXISTS automation_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id TEXT NOT NULL,
    at TEXT NOT NULL,
    trigger TEXT NOT NULL,
    outcome TEXT NOT NULL,
    detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_rule ON automation_runs(rule_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_at ON automation_runs(at DESC);
`
};
