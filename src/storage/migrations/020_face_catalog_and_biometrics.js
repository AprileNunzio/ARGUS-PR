export default {
    version: 20,
    name: 'face_catalog_and_biometrics',
    sql: `
ALTER TABLE people ADD COLUMN role TEXT DEFAULT 'dipendente';
ALTER TABLE people ADD COLUMN department TEXT DEFAULT '';
ALTER TABLE people ADD COLUMN special_permissions TEXT DEFAULT '[]';
ALTER TABLE people ADD COLUMN face_3d_params TEXT DEFAULT '{}';
ALTER TABLE people ADD COLUMN gallery TEXT DEFAULT '[]';
ALTER TABLE people ADD COLUMN sample_count INTEGER DEFAULT 1;

ALTER TABLE face_logs ADD COLUMN pose_3d TEXT DEFAULT '{}';
ALTER TABLE face_logs ADD COLUMN is_verified INTEGER DEFAULT 0;
ALTER TABLE face_logs ADD COLUMN corrected_person_id TEXT;

CREATE INDEX IF NOT EXISTS idx_face_logs_created ON face_logs(created_at DESC);
`
};
