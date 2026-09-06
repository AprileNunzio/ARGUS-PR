import test from 'node:test';
import assert from 'node:assert/strict';
import { slotIndex, isActive, TOTAL_SLOTS } from '../src/features/scheduling/schedule.js';

test('slotIndex calcola correttamente la domenica e il sabato notte', () => {
    const sundayMidnight = new Date(2026, 7, 30, 0, 0, 0);
    assert.equal(sundayMidnight.getDay(), 0);
    assert.equal(slotIndex(sundayMidnight), 0);

    const sundayMorning = new Date(2026, 7, 30, 0, 30, 0);
    assert.equal(slotIndex(sundayMorning), 1);

    const saturdayNight = new Date(2026, 8, 5, 23, 30, 0);
    assert.equal(saturdayNight.getDay(), 6);
    assert.equal(slotIndex(saturdayNight), 335);
});

test('slotIndex calcola correttamente il lunedi mattina', () => {
    const monday915 = new Date(2026, 7, 31, 9, 15, 0);
    assert.equal(monday915.getDay(), 1);
    assert.equal(slotIndex(monday915), 1 * 48 + 18);

    const monday945 = new Date(2026, 7, 31, 9, 45, 0);
    assert.equal(monday945.getDay(), 1);
    assert.equal(slotIndex(monday945), 1 * 48 + 19);
});

test('isActive rispetta la modalita continua e disattivata', () => {
    const now = new Date();
    assert.equal(isActive(null, null, now), true);
    assert.equal(isActive({ mode: 'continuous' }, null, now), true);
    assert.equal(isActive({ mode: 'off' }, null, now), false);
    assert.equal(isActive({ mode: 'motion' }, null, now), false);
});

test('isActive valuta la maschera settimanale per scheduled', () => {
    const monday915 = new Date(2026, 7, 31, 9, 15, 0);
    const index = 1 * 48 + 18;

    const activeChars = Array(TOTAL_SLOTS).fill('0');
    activeChars[index] = '1';
    const mask = activeChars.join('');

    const schedule = { mode: 'scheduled', weekMask: mask };
    assert.equal(isActive(schedule, null, monday915), true);

    const monday945 = new Date(2026, 7, 31, 9, 45, 0);
    assert.equal(isActive(schedule, null, monday945), false);
});

test('le eccezioni hanno la precedenza sulla maschera settimanale', () => {
    const monday915 = new Date(2026, 7, 31, 9, 15, 0);
    const schedule = { mode: 'continuous', weekMask: '1'.repeat(TOTAL_SLOTS) };

    const exceptionOff = { mode: 'off' };
    assert.equal(isActive(schedule, exceptionOff, monday915), false);

    const scheduleOff = { mode: 'off' };
    const exceptionOn = { mode: 'continuous' };
    assert.equal(isActive(scheduleOff, exceptionOn, monday915), true);
});

test('una maschera malformata disattiva la registrazione programmata', () => {
    const now = new Date();
    const broken = { mode: 'scheduled', weekMask: '101' };
    assert.equal(isActive(broken, null, now), false);
});
