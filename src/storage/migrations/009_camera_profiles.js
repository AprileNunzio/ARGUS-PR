export default {
    version: 9,
    name: 'camera_profiles',
    sql: `
ALTER TABLE cameras ADD COLUMN device_id TEXT;
ALTER TABLE cameras ADD COLUMN input_format TEXT;
ALTER TABLE cameras ADD COLUMN capture_width INTEGER;
ALTER TABLE cameras ADD COLUMN capture_height INTEGER;
ALTER TABLE cameras ADD COLUMN capture_fps INTEGER;
ALTER TABLE cameras ADD COLUMN audio_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cameras ADD COLUMN location TEXT;
ALTER TABLE cameras ADD COLUMN camera_group TEXT;
ALTER TABLE cameras ADD COLUMN retention_days INTEGER;
ALTER TABLE cameras ADD COLUMN hwaccel TEXT;
ALTER TABLE cameras ADD COLUMN notes TEXT;

CREATE INDEX IF NOT EXISTS idx_cameras_group ON cameras(camera_group);
`
};
