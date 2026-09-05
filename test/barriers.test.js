import test from 'node:test';
import assert from 'node:assert/strict';
import { ccw, segmentsIntersect, sideOfLine, checkTripwireCrossing } from '../src/features/automation/barriers.js';

test('segmentsIntersect correctly identifies crossing segments', () => {
    const line1 = [[0, 0], [10, 10]];
    const line2 = [[0, 10], [10, 0]];
    assert.equal(segmentsIntersect(line1[0], line1[1], line2[0], line2[1]), true);

    const parallel1 = [[0, 0], [10, 0]];
    const parallel2 = [[0, 5], [10, 5]];
    assert.equal(segmentsIntersect(parallel1[0], parallel1[1], parallel2[0], parallel2[1]), false);

    const nonCrossing = [[0, 0], [2, 2]];
    const other = [[5, 5], [10, 10]];
    assert.equal(segmentsIntersect(nonCrossing[0], nonCrossing[1], other[0], other[1]), false);
});

test('checkTripwireCrossing handles crossing and directions', () => {
    const tripwire = [[50, 0], [50, 100]];
    const pathLeftToRight = [[20, 50], [80, 50]];
    const pathRightToLeft = [[80, 50], [20, 50]];

    const resAny = checkTripwireCrossing(tripwire[0], tripwire[1], pathLeftToRight[0], pathLeftToRight[1], 'both');
    assert.ok(resAny);
    assert.equal(resAny.crossed, true);

    const resRightToLeft = checkTripwireCrossing(tripwire[0], tripwire[1], pathRightToLeft[0], pathRightToLeft[1], 'both');
    assert.ok(resRightToLeft);
    assert.notEqual(resAny.direction, resRightToLeft.direction);

    const resForbidden = checkTripwireCrossing(tripwire[0], tripwire[1], pathLeftToRight[0], pathLeftToRight[1], resRightToLeft.direction);
    assert.equal(resForbidden, null);
});
