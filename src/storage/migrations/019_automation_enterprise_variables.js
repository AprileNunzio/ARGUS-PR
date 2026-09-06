export default {
    version: 19,
    name: 'automation_enterprise_variables',
    sql: `
ALTER TABLE automation_rules ADD COLUMN message_template TEXT;
ALTER TABLE automation_rules ADD COLUMN min_dwell_seconds INTEGER DEFAULT 0;
ALTER TABLE automation_rules ADD COLUMN solar_mode TEXT DEFAULT 'none';
ALTER TABLE automation_rules ADD COLUMN arm_states TEXT DEFAULT '["disarmed","armed_home","armed_away"]';

CREATE TABLE IF NOT EXISTS security_system_state (
    id TEXT PRIMARY KEY,
    arm_state TEXT NOT NULL DEFAULT 'disarmed',
    updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO security_system_state (id, arm_state, updated_at)
VALUES ('global', 'disarmed', datetime('now'));
`
};
