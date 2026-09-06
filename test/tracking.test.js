import test from 'node:test';
import assert from 'node:assert/strict';
import { intersectionOverUnion, Tracker } from '../src/features/vision/tracking.js';

test('IoU calcola correttamente sovrapposizione e disgiunzione', () => {
    assert.equal(intersectionOverUnion([0, 0, 10, 10], [0, 0, 10, 10]), 1.0);
    assert.equal(intersectionOverUnion([0, 0, 10, 10], [20, 20, 10, 10]), 0.0);

    const halfOverlap = intersectionOverUnion([0, 0, 10, 10], [5, 0, 10, 10]);
    assert.ok(halfOverlap > 0.3 && halfOverlap < 0.4);
});

test('Tracker promuove a confermato dopo 3 frame e chiude dopo 5 assenze', () => {
    const tracker = new Tracker({ iouThreshold: 0.3, minHits: 3, maxMisses: 5 });

    const step1 = tracker.update([{ className: 'person', box: [0.1, 0.1, 0.2, 0.4], confidence: 0.85 }]);
    assert.equal(step1.activeTracks.length, 0);
    assert.equal(step1.newlyConfirmed.length, 0);

    const step2 = tracker.update([{ className: 'person', box: [0.11, 0.1, 0.2, 0.4], confidence: 0.88 }]);
    assert.equal(step2.activeTracks.length, 0);

    const step3 = tracker.update([{ className: 'person', box: [0.12, 0.1, 0.2, 0.4], confidence: 0.92 }]);
    assert.equal(step3.activeTracks.length, 1);
    assert.equal(step3.newlyConfirmed.length, 1);
    assert.equal(step3.activeTracks[0].className, 'person');
    assert.equal(step3.activeTracks[0].maxConfidence, 0.92);

    tracker.update([]);
    tracker.update([]);
    tracker.update([]);
    tracker.update([]);
    const stepFinal = tracker.update([]);
    assert.equal(stepFinal.closedTracks.length, 1);
    assert.equal(stepFinal.activeTracks.length, 0);
});

test('Tracker non associa rilevamenti di classi differenti anche se sovrapposti', () => {
    const tracker = new Tracker({ iouThreshold: 0.3, minHits: 1, maxMisses: 2 });
    const step1 = tracker.update([{ className: 'person', box: [0.2, 0.2, 0.2, 0.2], confidence: 0.9 }]);
    assert.equal(step1.activeTracks.length, 1);
    assert.equal(step1.activeTracks[0].className, 'person');

    const step2 = tracker.update([{ className: 'car', box: [0.2, 0.2, 0.2, 0.2], confidence: 0.95 }]);
    assert.equal(step2.activeTracks.length, 2);
});
