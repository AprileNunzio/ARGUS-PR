import test from 'node:test';
import assert from 'node:assert/strict';
import { planRetention, RetentionReason } from '../src/features/recording/retention.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 0, 20, 12, 0, 0);

function segment(id, ageDays, bytes, hasEvent = false, isProtected = false) {
    return {
        file: `seg-${id}.mp4`,
        startedAt: NOW - ageDays * DAY,
        bytes,
        hasEvent,
        protected: isProtected
    };
}

const NO_LIMITS = { maxAgeDays: 0, eventMaxAgeDays: 0, maxBytes: 0, minFreeBytes: 0, currentFreeBytes: -1 };

test('i segmenti ordinari vengono rimossi prima di quelli con eventi per eta', () => {
    const normalOld = segment(1, 10, 1000, false);
    const eventOld = segment(2, 10, 1000, true);
    const eventVeryOld = segment(3, 40, 1000, true);

    const plan = planRetention(
        [normalOld, eventOld, eventVeryOld],
        { ...NO_LIMITS, maxAgeDays: 7, eventMaxAgeDays: 30 },
        NOW
    );

    assert.equal(plan.remove.length, 2);
    assert.ok(plan.remove.some((s) => s.file === 'seg-1.mp4'));
    assert.ok(plan.remove.some((s) => s.file === 'seg-3.mp4'));
    assert.equal(plan.keep.length, 1);
    assert.equal(plan.keep[0].file, 'seg-2.mp4');
});

test('la quota sacrifica i segmenti senza evento prima di toccare quelli con evento', () => {
    const normal1 = segment(1, 5, 1000, false);
    const normal2 = segment(2, 4, 1000, false);
    const event1 = segment(3, 6, 1000, true);

    const plan = planRetention(
        [normal1, normal2, event1],
        { ...NO_LIMITS, maxBytes: 1500 },
        NOW
    );

    assert.equal(plan.remove.length, 2);
    assert.equal(plan.remove[0].file, 'seg-1.mp4');
    assert.equal(plan.remove[1].file, 'seg-2.mp4');
    assert.equal(plan.keep.length, 1);
    assert.equal(plan.keep[0].file, 'seg-3.mp4');
});

test('la pressione disco rispetta la priorita degli eventi', () => {
    const normal1 = segment(1, 1, 2000, false);
    const event1 = segment(2, 2, 2000, true);

    const plan = planRetention(
        [normal1, event1],
        { ...NO_LIMITS, minFreeBytes: 1500, currentFreeBytes: 0 },
        NOW
    );

    assert.equal(plan.remove.length, 1);
    assert.equal(plan.remove[0].file, 'seg-1.mp4');
    assert.equal(plan.keep.length, 1);
    assert.equal(plan.keep[0].file, 'seg-2.mp4');
});
