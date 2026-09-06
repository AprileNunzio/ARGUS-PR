import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/storage/database.js';
import { setSetting, invalidateSettings } from '../src/features/settings/settings_repository.js';
import { RestartPolicy } from '../src/features/settings/settings_schema.js';
import { Phase, readState, writeState, quarantine, isQuarantined, pardon } from '../src/features/updates/update_state.js';
import { runAutomaticUpgrade, approveRestart, dismissPendingUpgrade, Outcome } from '../src/features/updates/auto_update.js';
import { insideWindow, nextOpening } from '../src/features/updates/maintenance_window.js';
import { setLogLevel } from '../src/kernel/logger.js';

setLogLevel('error');
openDatabase({ databaseFile: ':memory:' });

function scratch() {
    return { dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'argus-update-')) };
}

function policy(values) {
    invalidateSettings();
    setSetting('updates.autoCheck', true);
    setSetting('updates.restartPolicy', RestartPolicy.ASK);
    setSetting('updates.minIntervalMinutes', 60);
    setSetting('updates.windowDays', [0, 1, 2, 3, 4, 5, 6]);
    setSetting('updates.windowStart', '03:00');
    setSetting('updates.windowEnd', '05:00');

    for (const [key, value] of Object.entries(values ?? {})) setSetting(key, value);
}

function available(tag = 'v99.0.0') {
    return async () => ({
        currentVersion: '0.0.1',
        latest: { tag, name: tag, prerelease: false, publishedAt: null, url: '', notes: '' },
        updateAvailable: true,
        checkedAt: new Date().toISOString()
    });
}

const upToDate = async () => ({
    currentVersion: '0.0.1',
    latest: { tag: 'v0.0.1', name: 'v0.0.1', prerelease: false, publishedAt: null, url: '', notes: '' },
    updateAvailable: false,
    checkedAt: new Date().toISOString()
});

function recorder() {
    const applied = [];
    return {
        applied,
        apply: async (config, target, trigger) => {
            applied.push({ target, trigger });
            return { outcome: Outcome.UPGRADING, target };
        }
    };
}

const supported = () => true;

test('la quarantena registra un riferimento, lo riconosce e lo libera', () => {
    const config = scratch();

    quarantine(config, 'v9.9.9');
    assert.equal(isQuarantined(readState(config), 'v9.9.9'), true);

    pardon(config, 'v9.9.9');
    assert.equal(isQuarantined(readState(config), 'v9.9.9'), false);
});

test('la quarantena rifiuta riferimenti che non sono tag di release', () => {
    const config = scratch();

    quarantine(config, 'main');
    quarantine(config, '../../etc/passwd');
    quarantine(config, 'v1.2.3; rm -rf /');

    assert.deepEqual(readState(config).quarantine, []);
});

test('la quarantena non cresce oltre il limite', () => {
    const config = scratch();
    for (let index = 0; index < 20; index += 1) quarantine(config, `v1.0.${index}`);

    const state = readState(config);
    assert.equal(state.quarantine.length, 10);
    assert.equal(state.quarantine.includes('v1.0.19'), true);
    assert.equal(state.quarantine.includes('v1.0.0'), false);
});

test('con la ricerca automatica spenta non viene fatto nulla', async () => {
    const config = scratch();
    policy({ 'updates.autoCheck': false });

    const outcome = await runAutomaticUpgrade(config, 'startup', { check: available(), supported });
    assert.equal(outcome.outcome, Outcome.DISABLED);
});

test('la politica predefinita chiede conferma e non riavvia mai da sola', async () => {
    const config = scratch();
    policy();
    const { applied, apply } = recorder();

    const outcome = await runAutomaticUpgrade(config, 'startup', { check: available(), apply, isGitInstall: supported });

    assert.equal(outcome.outcome, Outcome.AWAITING_APPROVAL);
    assert.equal(outcome.target, 'v99.0.0');
    assert.equal(applied.length, 0, 'nessun riavvio senza conferma');
    assert.equal(readState(config).phase, Phase.AWAITING_APPROVAL);
});

test('la conferma esplicita applica l aggiornamento in attesa', async () => {
    const config = scratch();
    policy();
    const { applied, apply } = recorder();

    await runAutomaticUpgrade(config, 'startup', { check: available(), apply, isGitInstall: supported });
    const outcome = await approveRestart(config, { apply });

    assert.equal(outcome.approved, true);
    assert.equal(applied.length, 1);
    assert.equal(applied[0].target, 'v99.0.0');
    assert.equal(applied[0].trigger, 'approval');
});

test('senza un aggiornamento in attesa la conferma non fa nulla', async () => {
    const config = scratch();
    const { applied, apply } = recorder();

    const outcome = await approveRestart(config, { apply });

    assert.equal(outcome.approved, false);
    assert.equal(applied.length, 0);
});

test('rimandare il riavvio riporta lo stato a inattivo', async () => {
    const config = scratch();
    policy();

    await runAutomaticUpgrade(config, 'startup', { check: available(), apply: recorder().apply, isGitInstall: supported });
    const state = dismissPendingUpgrade(config);

    assert.equal(state.phase, Phase.IDLE);
    assert.equal(state.targetRef, null);
});

test('fuori dalla finestra di manutenzione il riavvio attende', async () => {
    const config = scratch();
    policy({ 'updates.restartPolicy': RestartPolicy.WINDOW, 'updates.windowStart': '03:00', 'updates.windowEnd': '05:00' });
    const { applied, apply } = recorder();

    const noon = new Date(2026, 8, 3, 12, 0, 0);
    const outcome = await runAutomaticUpgrade(config, 'periodic', {
        check: available(),
        apply,
        isGitInstall: supported,
        now: () => noon
    });

    assert.equal(outcome.outcome, Outcome.AWAITING_WINDOW);
    assert.equal(applied.length, 0);
    assert.ok(outcome.opensAt, 'deve indicare la prossima apertura');
});

test('dentro la finestra di manutenzione il riavvio parte da solo', async () => {
    const config = scratch();
    policy({ 'updates.restartPolicy': RestartPolicy.WINDOW, 'updates.windowStart': '03:00', 'updates.windowEnd': '05:00' });
    const { applied, apply } = recorder();

    const night = new Date(2026, 8, 3, 3, 30, 0);
    const outcome = await runAutomaticUpgrade(config, 'window', {
        check: available(),
        apply,
        isGitInstall: supported,
        now: () => night
    });

    assert.equal(outcome.outcome, Outcome.UPGRADING);
    assert.equal(applied.length, 1);
});

test('la politica immediata applica senza chiedere', async () => {
    const config = scratch();
    policy({ 'updates.restartPolicy': RestartPolicy.IMMEDIATE });
    const { applied, apply } = recorder();

    const outcome = await runAutomaticUpgrade(config, 'startup', { check: available(), apply, isGitInstall: supported });

    assert.equal(outcome.outcome, Outcome.UPGRADING);
    assert.equal(applied.length, 1);
});

test('un tentativo troppo ravvicinato viene rimandato', async () => {
    const config = scratch();
    policy({ 'updates.restartPolicy': RestartPolicy.IMMEDIATE });
    writeState(config, { lastAutoAttemptAt: new Date().toISOString() });

    const { applied, apply } = recorder();
    const outcome = await runAutomaticUpgrade(config, 'periodic', { check: available(), apply, isGitInstall: supported });

    assert.equal(outcome.outcome, Outcome.THROTTLED);
    assert.equal(applied.length, 0);
});

test('una versione in quarantena non viene mai riapplicata da sola', async () => {
    const config = scratch();
    policy({ 'updates.restartPolicy': RestartPolicy.IMMEDIATE });
    quarantine(config, 'v99.0.0');

    const { applied, apply } = recorder();
    const outcome = await runAutomaticUpgrade(config, 'startup', { check: available(), apply, isGitInstall: supported });

    assert.equal(outcome.outcome, Outcome.QUARANTINED);
    assert.equal(applied.length, 0);
});

test('un aggiornamento automatico fallito finisce in quarantena', async () => {
    const config = scratch();
    policy({ 'updates.autoCheck': false });

    writeState(config, {
        phase: Phase.ROLLED_BACK,
        targetRef: 'v9.9.9',
        automatic: true,
        message: 'La nuova versione non si e avviata'
    });

    await runAutomaticUpgrade(config, 'startup', { check: available(), isGitInstall: supported });

    const state = readState(config);
    assert.equal(state.phase, Phase.IDLE);
    assert.equal(isQuarantined(state, 'v9.9.9'), true);
});

test('un aggiornamento manuale fallito non finisce in quarantena', async () => {
    const config = scratch();
    policy({ 'updates.autoCheck': false });

    writeState(config, { phase: Phase.FAILED, targetRef: 'v9.9.9', automatic: false, message: 'Checkout fallito' });

    await runAutomaticUpgrade(config, 'startup', { check: available(), isGitInstall: supported });

    assert.equal(isQuarantined(readState(config), 'v9.9.9'), false);
});

test('durante la finestra di verifica non parte un altro aggiornamento', async () => {
    const config = scratch();
    policy();
    writeState(config, { phase: Phase.PENDING, targetRef: 'v9.9.9', attempts: 1 });

    const outcome = await runAutomaticUpgrade(config, 'startup', { check: available(), isGitInstall: supported });

    assert.equal(outcome.outcome, Outcome.VALIDATING);
    assert.equal(readState(config).phase, Phase.PENDING);
});

test('se GitHub non risponde si avvia la versione installata', async () => {
    const config = scratch();
    policy();

    const outcome = await runAutomaticUpgrade(config, 'startup', {
        check: async () => { throw new Error('rete assente'); },
        isGitInstall: supported
    });

    assert.equal(outcome.outcome, Outcome.UNREACHABLE);
});

test('quando non ci sono novita lo stato di attesa viene liberato', async () => {
    const config = scratch();
    policy();

    await runAutomaticUpgrade(config, 'startup', { check: available(), apply: recorder().apply, isGitInstall: supported });
    assert.equal(readState(config).phase, Phase.AWAITING_APPROVAL);

    const outcome = await runAutomaticUpgrade(config, 'periodic', { check: upToDate, isGitInstall: supported });

    assert.equal(outcome.outcome, Outcome.UP_TO_DATE);
    assert.equal(readState(config).phase, Phase.IDLE);
});

test('la finestra riconosce gli orari e attraversa la mezzanotte', () => {
    const window = { days: [0, 1, 2, 3, 4, 5, 6], start: '23:00', end: '02:00' };

    assert.equal(insideWindow(new Date(2026, 8, 3, 23, 30), window), true);
    assert.equal(insideWindow(new Date(2026, 8, 3, 1, 30), window), true);
    assert.equal(insideWindow(new Date(2026, 8, 3, 12, 0), window), false);
});

test('la finestra rispetta i giorni scelti', () => {
    const giovedi = new Date(2026, 8, 3, 4, 0);
    assert.equal(giovedi.getDay(), 4);

    assert.equal(insideWindow(giovedi, { days: [4], start: '03:00', end: '05:00' }), true);
    assert.equal(insideWindow(giovedi, { days: [1], start: '03:00', end: '05:00' }), false);
    assert.equal(insideWindow(giovedi, { days: [], start: '03:00', end: '05:00' }), false);
});

test('la prossima apertura viene calcolata nel futuro', () => {
    const noon = new Date(2026, 8, 3, 12, 0);
    const opening = nextOpening(noon, { days: [0, 1, 2, 3, 4, 5, 6], start: '03:00', end: '05:00' });

    assert.ok(opening);
    assert.ok(new Date(opening).getTime() > noon.getTime());
});

test('lo stato su disco sopravvive a un file corrotto', () => {
    const config = scratch();

    quarantine(config, 'v9.9.9');
    fs.writeFileSync(path.join(config.dataDir, 'update-state.json'), '{ rotto');

    const state = readState(config);
    assert.equal(state.phase, Phase.IDLE);
    assert.deepEqual(state.quarantine, []);
});
