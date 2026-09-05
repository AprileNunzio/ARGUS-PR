export default {
    version: 14,
    name: 'audio_clips',
    sql: `
CREATE TABLE IF NOT EXISTS audio_clips (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    file_name TEXT NOT NULL,
    byte_size INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audio_clips_name ON audio_clips(name);
`
};
