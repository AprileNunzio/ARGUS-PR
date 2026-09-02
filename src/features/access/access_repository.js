import { randomUUID } from 'node:crypto';
import { normalisePlate } from '../vision/plates.js';

function mapRule(row) {
    if (!row) return null;
    return {
        id: row.id,
        platePattern: row.plate_pattern,
        plateNormalised: row.plate_normalised,
        label: row.label,
        listType: row.list_type,
        isActive: Boolean(row.is_active),
        validFrom: row.valid_from,
        validTo: row.valid_to,
        createdAt: row.created_at
    };
}

function mapEvent(row) {
    if (!row) return null;
    return {
        id: row.id,
        cameraId: row.camera_id,
        plate: row.plate,
        decision: row.decision,
        ruleId: row.rule_id,
        confidence: row.confidence,
        snapshotPath: row.snapshot_path,
        createdAt: row.created_at
    };
}

export function createAccessRepository(db) {
    const listRulesStmt = db.prepare('SELECT * FROM access_rules ORDER BY created_at DESC');
    const getRuleStmt = db.prepare('SELECT * FROM access_rules WHERE id = ?');
    const insertRuleStmt = db.prepare(`
        INSERT INTO access_rules (id, plate_pattern, plate_normalised, label, list_type, is_active, valid_from, valid_to, created_at)
        VALUES (@id, @platePattern, @plateNormalised, @label, @listType, @isActive, @validFrom, @validTo, @createdAt)
    `);
    const updateRuleStmt = db.prepare(`
        UPDATE access_rules
        SET plate_pattern = @platePattern,
            plate_normalised = @plateNormalised,
            label = @label,
            list_type = @listType,
            is_active = @isActive,
            valid_from = @validFrom,
            valid_to = @validTo
        WHERE id = @id
    `);
    const deleteRuleStmt = db.prepare('DELETE FROM access_rules WHERE id = ?');

    const insertEventStmt = db.prepare(`
        INSERT INTO access_events (id, camera_id, plate, decision, rule_id, confidence, snapshot_path, created_at)
        VALUES (@id, @cameraId, @plate, @decision, @ruleId, @confidence, @snapshotPath, @createdAt)
    `);
    const listEventsStmt = db.prepare('SELECT * FROM access_events ORDER BY created_at DESC LIMIT ? OFFSET ?');
    const listEventsByPlateStmt = db.prepare('SELECT * FROM access_events WHERE plate = ? ORDER BY created_at DESC LIMIT ? OFFSET ?');

    return {
        listRules() {
            return listRulesStmt.all().map(mapRule);
        },
        getRule(id) {
            return mapRule(getRuleStmt.get(id));
        },
        createRule({ platePattern, label, listType, isActive = true, validFrom = null, validTo = null }) {
            const rule = {
                id: randomUUID(),
                platePattern: platePattern.trim().toUpperCase(),
                plateNormalised: normalisePlate(platePattern),
                label: label.trim(),
                listType,
                isActive: isActive ? 1 : 0,
                validFrom,
                validTo,
                createdAt: new Date().toISOString()
            };
            insertRuleStmt.run(rule);
            return this.getRule(rule.id);
        },
        updateRule(id, changes) {
            const current = this.getRule(id);
            if (!current) return null;
            const updated = {
                id,
                platePattern: (changes.platePattern ?? current.platePattern).trim().toUpperCase(),
                plateNormalised: normalisePlate(changes.platePattern ?? current.platePattern),
                label: (changes.label ?? current.label).trim(),
                listType: changes.listType ?? current.listType,
                isActive: (changes.isActive ?? current.isActive) ? 1 : 0,
                validFrom: changes.validFrom !== undefined ? changes.validFrom : current.validFrom,
                validTo: changes.validTo !== undefined ? changes.validTo : current.validTo
            };
            updateRuleStmt.run(updated);
            return this.getRule(id);
        },
        deleteRule(id) {
            const info = deleteRuleStmt.run(id);
            return info.changes > 0;
        },
        recordEvent({ cameraId, plate, decision, ruleId = null, confidence = null, snapshotPath = null, createdAt = new Date().toISOString() }) {
            const event = {
                id: randomUUID(),
                cameraId,
                plate: normalisePlate(plate),
                decision,
                ruleId,
                confidence,
                snapshotPath,
                createdAt
            };
            insertEventStmt.run(event);
            return {
                id: event.id,
                cameraId: event.cameraId,
                plate: event.plate,
                decision: event.decision,
                ruleId: event.ruleId,
                confidence: event.confidence,
                snapshotPath: event.snapshotPath,
                createdAt: event.createdAt
            };
        },

        listEvents({ limit = 50, offset = 0, plate = null } = {}) {
            const lim = Math.min(Math.max(1, limit), 200);
            const off = Math.max(0, offset);
            if (plate) {
                return listEventsByPlateStmt.all(normalisePlate(plate), lim, off).map(mapEvent);
            }
            return listEventsStmt.all(lim, off).map(mapEvent);
        }
    };
}
