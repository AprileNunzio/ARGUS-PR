import test from 'node:test';
import assert from 'node:assert/strict';
import { planRetention, RetentionReason } from '../src/features/recording/retention.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 0, 20, 12, 0, 0);

function segment(id, ageDays, bytes, isProtected = false) {
    return { file: `seg-${id}.mp4`, startedAt: NOW - ageDays * DAY, bytes, protected: isProtected };
}

const NO_LIMITS = { maxAgeDays: 0, maxBytes: 0, minFreeBytes: 0, currentFreeBytes: -1 };

test('non rimuove nulla senza limiti configurati', () => {
    const plan = planRetention([segment(1, 100, 1000)], NO_LIMITS, NOW);
    assert.equal(plan.remove.length, 0);
    assert.equal(plan.keep.length, 1);
});

test('rimuove i segmenti oltre l eta massima', () => {
    const plan = planRetention(
        [segment(1, 20, 1000), segment(2, 5, 1000)],
        { ...NO_LIMITS, maxAgeDays: 14 },
        NOW
    );
    assert.equal(plan.remove.length, 1);
    assert.equal(plan.remove[0].file, 'seg-1.mp4');
    assert.equal(plan.remove[0].reason, RetentionReason.AGE);
});

test('non cancella mai un segmento protetto', () => {
    const plan = planRetention(
        [segment(1, 900, 1000, true), segment(2, 900, 1000)],
        { ...NO_LIMITS, maxAgeDays: 1, maxBytes: 1, minFreeBytes: 10 ** 12, currentFreeBytes: 0 },
        NOW
    );
    assert.ok(plan.remove.every((item) => item.file !== 'seg-1.mp4'));
    assert.ok(plan.keep.some((item) => item.file === 'seg-1.mp4'));
});

test('applica la quota partendo dai piu vecchi', () => {
    const plan = planRetention(
        [segment(1, 3, 500), segment(2, 2, 500), segment(3, 1, 500)],
        { ...NO_LIMITS, maxBytes: 1000 },
        NOW
    );
    assert.equal(plan.remove.length, 1);
    assert.equal(plan.remove[0].file, 'seg-1.mp4');
    assert.equal(plan.remove[0].reason, RetentionReason.CAMERA_QUOTA);
    assert.equal(plan.remainingBytes, 1000);
});

test('libera spazio sotto la soglia minima di disco', () => {
    const plan = planRetention(
        [segment(1, 3, 400), segment(2, 2, 400)],
        { ...NO_LIMITS, minFreeBytes: 1000, currentFreeBytes: 300 },
        NOW
    );
    assert.ok(plan.remove.length >= 1);
    assert.equal(plan.remove[0].reason, RetentionReason.DISK_PRESSURE);
});

test('e deterministica e non altera l inventario originale', () => {
    const inventory = [segment(1, 30, 100), segment(2, 2, 100)];
    const snapshot = JSON.stringify(inventory);
    const policy = { ...NO_LIMITS, maxAgeDays: 7 };

    const first = planRetention(inventory, policy, NOW);
    const second = planRetention(inventory, policy, NOW);

    assert.deepEqual(first.remove.map((i) => i.file), second.remove.map((i) => i.file));
    assert.equal(JSON.stringify(inventory), snapshot);
});

test('un inventario vuoto non produce rimozioni', () => {
    const plan = planRetention([], { ...NO_LIMITS, maxAgeDays: 1, maxBytes: 1 }, NOW);
    assert.equal(plan.remove.length, 0);
    assert.equal(plan.remainingBytes, 0);
});
