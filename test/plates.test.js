import test from 'node:test';
import assert from 'node:assert/strict';
import { normalisePlate, isValidPlateFormat, voteOnPlate } from '../src/features/vision/plates.js';

test('normalisePlate converte in maiuscolo e rimuove caratteri speciali', () => {
    assert.equal(normalisePlate('ab-123 cd'), 'AB123CD');
    assert.equal(normalisePlate('  fe_889-zz '), 'FE889ZZ');
    assert.equal(normalisePlate(null), '');
});

test('isValidPlateFormat riconosce formati italiani ed europei validi', () => {
    assert.equal(isValidPlateFormat('AB123CD', { strictItalian: true }), true);
    assert.equal(isValidPlateFormat('123ABCD', { strictItalian: true }), false);
    assert.equal(isValidPlateFormat('B-AB1234', { strictItalian: false }), true);
    assert.equal(isValidPlateFormat('AB', { strictItalian: false }), false);
});

test('voteOnPlate elegge la lettura prevalente pesata per confidenza', () => {
    const readings = [
        { text: 'AB123CD', confidence: 0.90 },
        { text: 'A8123CD', confidence: 0.70 },
        { text: 'AB123CD', confidence: 0.95 },
        { text: 'AB123CD', confidence: 0.88 },
        { text: 'A8123CD', confidence: 0.65 }
    ];

    const result = voteOnPlate(readings, 3);
    assert.ok(result);
    assert.equal(result.text, 'AB123CD');
    assert.equal(result.samples, 5);
    assert.equal(result.isFormatValid, true);
});

test('voteOnPlate rispetta la soglia minima di campioni (minVotes)', () => {
    const readings = [
        { text: 'AB123CD', confidence: 0.95 },
        { text: 'AB123CD', confidence: 0.90 }
    ];

    assert.equal(voteOnPlate(readings, 3), null);
    assert.ok(voteOnPlate(readings, 2));
});
