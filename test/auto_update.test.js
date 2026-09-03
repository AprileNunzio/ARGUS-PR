import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Phase, readState, writeState, quarantine, isQuarantined, pardon } from '../src/features/updates/update_state.js';
import { runAutomaticUpgrade, Outcome } from '../src/features/updates/auto_update.js';
import { setLogLevel } from '../src/kernel/logger.js';

setLogLevel('error');

function scratch(overrides = {}) {
    return {
        dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'argus-update-')),
        autoUpdate: true,
        autoUpdateMinIntervalMinutes: 60,
        ...overrides
    };
}

test('la quarantena registra un riferimento e lo riconosce', () => {
    const config = scratch();

    quarantine(config, 'v9.9.9');
    assert.equal(isQuarantined(readState(config), 'v9.9.9'), true);
    assert.equal(isQuarantined(readState(config), 'v9.9.8'), false);

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

test('con aggiornamento automatico spento non viene fatto nulla', async () => {
    const config = scratch({ autoUpdate: false });
    const outcome = await runAutomaticUpgrade(config);

    assert.equal(outcome.outcome, Outcome.DISABLED);
});

test('un aggiornamento fallito mette la versione in quarantena e libera lo stato', async () => {
    const config = scratch({ autoUpdate: false });

    writeState(config, {
        phase: Phase.ROLLED_BACK,
        targetRef: 'v9.9.9',
        automatic: true,
        message: 'La nuova versione non si e avviata'
    });

    await runAutomaticUpgrade(config);

    const state = readState(config);
    assert.equal(state.phase, Phase.IDLE);
    assert.equal(state.targetRef, null);
    assert.equal(state.automatic, false);
    assert.equal(isQuarantined(state, 'v9.9.9'), true);
});

test('un aggiornamento manuale fallito non finisce in quarantena', async () => {
    const config = scratch({ autoUpdate: false });

    writeState(config, {
        phase: Phase.FAILED,
        targetRef: 'v9.9.9',
        automatic: false,
        message: 'Checkout fallito'
    });

    await runAutomaticUpgrade(config);

    const state = readState(config);
    assert.equal(state.phase, Phase.IDLE);
    assert.equal(isQuarantined(state, 'v9.9.9'), false);
});

test('durante la finestra di verifica non parte un altro aggiornamento', async () => {
    const config = scratch();

    writeState(config, { phase: Phase.PENDING, targetRef: 'v9.9.9', attempts: 1 });

    const outcome = await runAutomaticUpgrade(config);
    assert.equal(outcome.outcome, Outcome.VALIDATING);
    assert.equal(readState(config).phase, Phase.PENDING);
});

test('un tentativo troppo ravvicinato viene rimandato', async () => {
    const config = scratch();

    writeState(config, { lastAutoAttemptAt: new Date().toISOString() });

    const outcome = await runAutomaticUpgrade(config);
    assert.equal(outcome.outcome, Outcome.THROTTLED);
});

test('scaduto l intervallo il tentativo non e piu bloccato dal freno', async () => {
    const config = scratch({ autoUpdateMinIntervalMinutes: 1 });

    writeState(config, { lastAutoAttemptAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() });

    const outcome = await runAutomaticUpgrade(config);
    assert.notEqual(outcome.outcome, Outcome.THROTTLED);
});

test('lo stato su disco sopravvive a un file corrotto', () => {
    const config = scratch();

    quarantine(config, 'v9.9.9');
    fs.writeFileSync(path.join(config.dataDir, 'update-state.json'), '{ rotto');

    const state = readState(config);
    assert.equal(state.phase, Phase.IDLE);
    assert.deepEqual(state.quarantine, []);
});
