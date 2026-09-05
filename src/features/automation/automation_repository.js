import { getDatabase } from '../../storage/database.js';
import { encryptSecret, decryptSecret } from '../../security/vault.js';

function ruleToPublic(row) {
    return {
        id: row.id,
        name: row.name,
        enabled: row.enabled === 1,
        triggerKind: row.trigger_kind,
        cameraId: row.camera_id,
        className: row.class_name,
        minConfidence: row.min_confidence,
        plateScope: row.plate_scope,
        personScope: row.person_scope,
        targetPlate: row.target_plate,
        targetPersonId: row.target_person_id,
        upperColor: row.upper_color,
        minOccurrences: row.min_occurrences ?? 1,
        occurrenceWindowMinutes: row.occurrence_window_minutes ?? 60,
        weekMask: row.week_mask,
        cooldownSeconds: row.cooldown_seconds,
        dailyLimit: row.daily_limit,
        actions: JSON.parse(row.actions),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function channelToPublic(row) {
    return {
        id: row.id,
        kind: row.kind,
        name: row.name,
        enabled: row.enabled === 1,
        config: JSON.parse(row.config),
        hasSecret: Boolean(row.secret),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

export function listRules() {
    return getDatabase().prepare('SELECT * FROM automation_rules ORDER BY name COLLATE NOCASE').all().map(ruleToPublic);
}

export function listActiveRules() {
    return getDatabase().prepare('SELECT * FROM automation_rules WHERE enabled = 1').all().map(ruleToPublic);
}

export function getRule(id) {
    const row = getDatabase().prepare('SELECT * FROM automation_rules WHERE id = ?').get(id);
    return row ? ruleToPublic(row) : null;
}

export function saveRule(rule) {
    const at = new Date().toISOString();
    const existing = getRule(rule.id);

    if (existing) {
        getDatabase().prepare(`UPDATE automation_rules SET
            name = ?, enabled = ?, trigger_kind = ?, camera_id = ?, class_name = ?, min_confidence = ?,
            plate_scope = ?, person_scope = ?, target_plate = ?, target_person_id = ?, upper_color = ?,
            min_occurrences = ?, occurrence_window_minutes = ?, week_mask = ?, cooldown_seconds = ?,
            daily_limit = ?, actions = ?, updated_at = ? WHERE id = ?`)
            .run(
                rule.name, rule.enabled ? 1 : 0, rule.triggerKind, rule.cameraId ?? null, rule.className ?? null,
                rule.minConfidence ?? 0, rule.plateScope ?? 'any', rule.personScope ?? 'any',
                rule.targetPlate ?? null, rule.targetPersonId ?? null, rule.upperColor ?? null,
                rule.minOccurrences ?? 1, rule.occurrenceWindowMinutes ?? 60, rule.weekMask ?? null,
                rule.cooldownSeconds ?? 60, rule.dailyLimit ?? null, JSON.stringify(rule.actions ?? []), at, rule.id
            );
        return getRule(rule.id);
    }

    getDatabase().prepare(`INSERT INTO automation_rules
        (id, name, enabled, trigger_kind, camera_id, class_name, min_confidence, plate_scope, person_scope,
         target_plate, target_person_id, upper_color, min_occurrences, occurrence_window_minutes,
         week_mask, cooldown_seconds, daily_limit, actions, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
            rule.id, rule.name, rule.enabled ? 1 : 0, rule.triggerKind, rule.cameraId ?? null, rule.className ?? null,
            rule.minConfidence ?? 0, rule.plateScope ?? 'any', rule.personScope ?? 'any',
            rule.targetPlate ?? null, rule.targetPersonId ?? null, rule.upperColor ?? null,
            rule.minOccurrences ?? 1, rule.occurrenceWindowMinutes ?? 60,
            rule.weekMask ?? null, rule.cooldownSeconds ?? 60, rule.dailyLimit ?? null,
            JSON.stringify(rule.actions ?? []), at, at
        );

    return getRule(rule.id);
}

export function deleteRule(id) {
    return getDatabase().prepare('DELETE FROM automation_rules WHERE id = ?').run(id).changes > 0;
}

export function listChannels() {
    return getDatabase().prepare('SELECT * FROM automation_channels ORDER BY name COLLATE NOCASE').all().map(channelToPublic);
}

export function getChannel(id) {
    const row = getDatabase().prepare('SELECT * FROM automation_channels WHERE id = ?').get(id);
    return row ? channelToPublic(row) : null;
}

export function getChannelSecret(id) {
    const row = getDatabase().prepare('SELECT secret FROM automation_channels WHERE id = ?').get(id);
    return row?.secret ? decryptSecret(row.secret) : null;
}

export function saveChannel(channel) {
    const at = new Date().toISOString();
    const existing = getDatabase().prepare('SELECT * FROM automation_channels WHERE id = ?').get(channel.id);

    const secret = channel.secret === undefined
        ? existing?.secret ?? null
        : (channel.secret ? encryptSecret(channel.secret) : null);

    if (existing) {
        getDatabase().prepare(`UPDATE automation_channels SET
            kind = ?, name = ?, enabled = ?, config = ?, secret = ?, updated_at = ? WHERE id = ?`)
            .run(channel.kind, channel.name, channel.enabled ? 1 : 0, JSON.stringify(channel.config ?? {}), secret, at, channel.id);
        return getChannel(channel.id);
    }

    getDatabase().prepare(`INSERT INTO automation_channels (id, kind, name, enabled, config, secret, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(channel.id, channel.kind, channel.name, channel.enabled ? 1 : 0, JSON.stringify(channel.config ?? {}), secret, at, at);

    return getChannel(channel.id);
}

export function deleteChannel(id) {
    return getDatabase().prepare('DELETE FROM automation_channels WHERE id = ?').run(id).changes > 0;
}

export function recordRun(entry) {
    getDatabase().prepare('INSERT INTO automation_runs (rule_id, at, trigger, outcome, detail) VALUES (?, ?, ?, ?, ?)')
        .run(entry.ruleId, new Date(entry.at ?? Date.now()).toISOString(), entry.trigger, entry.outcome, entry.detail ?? null);
}

export function listRuns(limit = 100) {
    return getDatabase()
        .prepare('SELECT * FROM automation_runs ORDER BY at DESC LIMIT ?')
        .all(Math.min(Math.max(limit, 1), 500))
        .map((row) => ({
            id: row.id,
            ruleId: row.rule_id,
            at: row.at,
            trigger: row.trigger,
            outcome: row.outcome,
            detail: row.detail
        }));
}

export function pruneRuns(keep = 2000) {
    getDatabase()
        .prepare('DELETE FROM automation_runs WHERE id NOT IN (SELECT id FROM automation_runs ORDER BY at DESC LIMIT ?)')
        .run(keep);
}
