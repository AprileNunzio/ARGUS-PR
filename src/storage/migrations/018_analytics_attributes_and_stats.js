export default {
    version: 18,
    name: 'analytics_attributes_and_stats',
    sql: `
ALTER TABLE detection_events ADD COLUMN upper_color TEXT;
CREATE INDEX IF NOT EXISTS idx_events_upper_color ON detection_events(class_name, upper_color);
CREATE INDEX IF NOT EXISTS idx_events_person_time ON detection_events(person_id, started_at DESC);

ALTER TABLE automation_rules ADD COLUMN target_plate TEXT;
ALTER TABLE automation_rules ADD COLUMN target_person_id TEXT;
ALTER TABLE automation_rules ADD COLUMN upper_color TEXT;
ALTER TABLE automation_rules ADD COLUMN min_occurrences INTEGER NOT NULL DEFAULT 1;
ALTER TABLE automation_rules ADD COLUMN occurrence_window_minutes INTEGER NOT NULL DEFAULT 60;
`
};
