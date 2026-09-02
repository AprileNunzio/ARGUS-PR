import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesPattern, evaluateAccess } from '../src/features/access/access_rules.js';

test('matchesPattern verifica pattern esatti e con caratteri jolly', () => {
    assert.equal(matchesPattern('AB123CD', 'AB123CD'), true);
    assert.equal(matchesPattern('AB123CD', 'AB*CD'), true);
    assert.equal(matchesPattern('AB123CD', 'AB???CD'), true);
    assert.equal(matchesPattern('AB123CD', 'XY*'), false);
    assert.equal(matchesPattern('AB123CD', '*123*'), true);
});

test('evaluateAccess applica correttamente whitelist, blacklist e precedenze', () => {
    const rules = [
        {
            id: 'r1',
            plateNormalised: 'AB123CD',
            label: 'Dipendente',
            listType: 'whitelist',
            isActive: true
        },
        {
            id: 'r2',
            plateNormalised: 'XY999ZZ',
            label: 'Sospetto',
            listType: 'blacklist',
            isActive: true
        },
        {
            id: 'r3',
            plateNormalised: 'MONITORED*',
            label: 'Flotta',
            listType: 'monitored',
            isActive: true
        }
    ];

    assert.equal(evaluateAccess('AB123CD', rules).decision, 'allow');
    assert.equal(evaluateAccess('XY999ZZ', rules).decision, 'deny');
    assert.equal(evaluateAccess('MONITORED01', rules).decision, 'log');
    assert.equal(evaluateAccess('UNKNOWN11', rules).decision, 'log');
});

test('la blacklist ha sempre precedenza sulla whitelist in caso di conflitto', () => {
    const conflictingRules = [
        {
            id: 'r-white',
            plateNormalised: 'AB123CD',
            listType: 'whitelist',
            isActive: true
        },
        {
            id: 'r-black',
            plateNormalised: 'AB*',
            listType: 'blacklist',
            isActive: true
        }
    ];

    const result = evaluateAccess('AB123CD', conflictingRules);
    assert.equal(result.decision, 'deny');
    assert.equal(result.rule.id, 'r-black');
});

test('una regola scaduta o non ancora attiva non viene applicata', () => {
    const timedRules = [
        {
            id: 'r-expired',
            plateNormalised: 'AB123CD',
            listType: 'whitelist',
            isActive: true,
            validTo: '2026-01-01T00:00:00.000Z'
        }
    ];

    const result = evaluateAccess('AB123CD', timedRules, '2026-09-01T00:00:00.000Z');
    assert.equal(result.decision, 'log');
});
