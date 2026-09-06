export default {
    version: 16,
    name: 'audit_chain',
    sql: `
ALTER TABLE audit_log ADD COLUMN prev_hash TEXT;
ALTER TABLE audit_log ADD COLUMN entry_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_entry_hash ON audit_log(entry_hash);
`
};
