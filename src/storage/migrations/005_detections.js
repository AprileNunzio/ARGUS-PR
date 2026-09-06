export default {
    version: 5,
    name: 'detections',
    sql: `
CREATE TABLE IF NOT EXISTS detection_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    camera_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_seen_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS detection_events (
    id TEXT PRIMARY KEY,
    camera_id TEXT NOT NULL,
    source TEXT NOT NULL,
    class_name TEXT NOT NULL,
    track_id TEXT,
    confidence REAL NOT NULL,
    box_x REAL,
    box_y REAL,
    box_w REAL,
    box_h REAL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    snapshot_path TEXT,
    plate_text TEXT,
    person_id TEXT,
    match_score REAL,
    zone_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_camera_time ON detection_events(camera_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_class ON detection_events(class_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_plate ON detection_events(plate_text);
`
};
