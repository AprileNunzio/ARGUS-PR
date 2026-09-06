export default {
    version: 13,
    name: 'storage_policies',
    sql: `
ALTER TABLE storage_pools ADD COLUMN retention_policy TEXT NOT NULL DEFAULT 'fifo';
ALTER TABLE storage_pools ADD COLUMN retention_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE storage_pools ADD COLUMN alarm_percent INTEGER NOT NULL DEFAULT 10;
ALTER TABLE storage_pools ADD COLUMN smb_version TEXT;
ALTER TABLE storage_pools ADD COLUMN mount_options TEXT;
ALTER TABLE storage_pools ADD COLUMN reconnect_seconds INTEGER NOT NULL DEFAULT 30;
`
};
