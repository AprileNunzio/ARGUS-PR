import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/storage/database.js';
import { createAccessRepository } from '../src/features/access/access_repository.js';

test('gestione regole di accesso targhe ed eventi di transito', () => {
    const db = openDatabase({ databaseFile: ':memory:' });
    const repo = createAccessRepository(db);

    const rule = repo.createRule({
        platePattern: 'AB123CD',
        label: 'Auto aziendale',
        listType: 'whitelist',
        isActive: true
    });

    assert.ok(rule.id);
    assert.equal(rule.platePattern, 'AB123CD');
    assert.equal(rule.plateNormalised, 'AB123CD');
    assert.equal(rule.listType, 'whitelist');

    const rules = repo.listRules();
    assert.equal(rules.length, 1);
    assert.equal(rules[0].id, rule.id);

    const updated = repo.updateRule(rule.id, { label: 'Auto aziendale aggiornata', listType: 'monitored' });
    assert.equal(updated.label, 'Auto aziendale aggiornata');
    assert.equal(updated.listType, 'monitored');

    const event = repo.recordEvent({
        cameraId: 'cam-gate',
        plate: 'AB-123 CD',
        decision: 'allow',
        ruleId: rule.id,
        confidence: 0.94
    });

    assert.ok(event.id);
    assert.equal(event.plate, 'AB123CD');
    assert.equal(event.decision, 'allow');

    const events = repo.listEvents({ plate: 'AB123CD' });
    assert.equal(events.length, 1);
    assert.equal(events[0].id, event.id);

    const deleted = repo.deleteRule(rule.id);
    assert.equal(deleted, true);
    assert.equal(repo.listRules().length, 0);
});
