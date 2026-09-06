export default {
    version: 3,
    name: 'schedules',
    sql: `
CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    camera_id TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'continuous',
    week_mask TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_exceptions (
    id TEXT PRIMARY KEY,
    camera_id TEXT NOT NULL,
    day TEXT NOT NULL,
    mode TEXT NOT NULL,
    week_mask TEXT,
    note TEXT,
    created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_camera ON schedules(camera_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exception_day ON schedule_exceptions(camera_id, day);
`
};
