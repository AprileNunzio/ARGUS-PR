import test from 'node:test';
import assert from 'node:assert/strict';
import { normalisePlate, isValidPlateFormat, voteOnPlate, coerceItalianPlate } from '../src/features/vision/plates.js';

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

test('una lettura senza cifre non e una targa', () => {
    for (const fake of ['CANMNS', 'CUMMONS', 'CMNES', 'CRAMAS', 'SUNDAY']) {
        assert.equal(isValidPlateFormat(fake), false, `${fake} accettata come targa`);
    }
    assert.equal(isValidPlateFormat('DS004NK'), true);
    assert.equal(isValidPlateFormat('AB123CD'), true);
});

test('il voto richiede letture concordi, non solo numerose', () => {
    const diverse = [
        { text: 'CANMNS', confidence: 0.85 },
        { text: 'CRAMAS', confidence: 0.85 },
        { text: 'CMNES', confidence: 0.85 },
        { text: 'CUMMONS', confidence: 0.85 }
    ];
    assert.equal(voteOnPlate(diverse), null);

    const agreeing = [
        { text: 'DS004NK', confidence: 0.6 },
        { text: 'DS004NK', confidence: 0.55 },
        { text: 'DS004NK', confidence: 0.62 }
    ];
    const voted = voteOnPlate(agreeing);
    assert.equal(voted.text, 'DS004NK');
    assert.equal(voted.isFormatValid, true);
});

test('una maggioranza concorde ma di formato impossibile viene scartata', () => {
    const readings = [
        { text: 'SUNDAY', confidence: 0.9 },
        { text: 'SUNDAY', confidence: 0.9 },
        { text: 'SUNDAY', confidence: 0.9 }
    ];
    assert.equal(voteOnPlate(readings), null);
});

test('coerceItalianPlate raddrizza le confusioni di carattere per posizione', () => {
    assert.equal(coerceItalianPlate('DSOOZNK'), 'DS002NK');
    assert.equal(coerceItalianPlate('IDSOOZNKS'), 'DS002NK');
    assert.equal(coerceItalianPlate('DS004NK'), 'DS004NK');
});

test('coerceItalianPlate rifiuta cio che non ha la forma di una targa', () => {
    for (const junk of ['18AZSG', '1887S6', 'D27IZE', '18TZSM', 'CANMNS', 'SUNDAY', '091721']) {
        assert.equal(coerceItalianPlate(junk), null, `${junk} accettata`);
    }
});

test('il registro dei formati scarta le letture dell orologio', () => {
    for (const junk of ['CANMNS', '18AZSG', '1887S6', 'SUNDAY', '091721', '06092026']) {
        assert.equal(isValidPlateFormat(junk), false, `${junk} accettata`);
    }
    for (const real of ['DS004NK', 'AB123CD']) {
        assert.equal(isValidPlateFormat(real), true, `${real} rifiutata`);
    }
});

test('in modalita italiana il voto raddrizza e scarta l orologio', () => {
    const clock = Array.from({ length: 4 }, () => ({ text: '18AZSG', confidence: 0.5 }));
    assert.equal(voteOnPlate(clock, 3, { format: 'italian' }), null);

    const real = [
        { text: 'IDSOOZNKS', confidence: 0.5 },
        { text: 'DSOOZNK', confidence: 0.5 },
        { text: 'IDS002NK', confidence: 0.5 }
    ];
    assert.equal(voteOnPlate(real, 3, { format: 'italian' }).text, 'DS002NK');
});
