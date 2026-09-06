export default {
    version: 21,
    name: 'face_log_embeddings',
    sql: `
ALTER TABLE face_logs ADD COLUMN embedding TEXT DEFAULT '[]';
`
};
