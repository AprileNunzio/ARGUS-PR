import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleWindowsStartup, applyWindowsUpdate } from '../src/features/updates/windows_updater.js';
import { isUpdateSupported } from '../src/features/updates/update_service.js';
import { Phase, readState, writeState, isQuarantined } from '../src/features/updates/update_state.js';

function sandbox() {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-winupdate-'));
    return { dataDir };
}

test('isUpdateSupported restituisce true su Windows', () => {
    if (process.platform === 'win32') {
        assert.equal(isUpdateSupported(), true);
    }
});

test('handleWindowsStartup non fa nulla se la fase non e PENDING', () => {
    const config = sandbox();
    writeState(config, { phase: Phase.IDLE });
    handleWindowsStartup(config);
    assert.equal(readState(config).phase, Phase.IDLE);
});

test('handleWindowsStartup incrementa attempts quando attempts e inferiore alla soglia', () => {
    const config = sandbox();
    writeState(config, { phase: Phase.PENDING, attempts: 1, targetRef: 'v1.0.0' });
    handleWindowsStartup(config);
    const state = readState(config);
    assert.equal(state.phase, Phase.PENDING);
    assert.equal(state.attempts, 2);
});

test('handleWindowsStartup esegue il rollback e mette in quarantena quando attempts supera la soglia', () => {
    const config = sandbox();
    const backupDir = path.join(config.dataDir, 'updates', 'backup');
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, 'package.json'), JSON.stringify({ name: 'argus-pr', version: '0.12.0' }));

    writeState(config, { phase: Phase.PENDING, attempts: 2, targetRef: 'v1.0.0', previousVersion: '0.12.0' });
    handleWindowsStartup(config);

    const state = readState(config);
    assert.equal(state.phase, Phase.ROLLED_BACK);
    assert.equal(state.attempts, 0);
    assert.equal(isQuarantined(state, 'v1.0.0'), true);
});

test('applyWindowsUpdate rifiuta riferimenti non validi', async () => {
    const config = sandbox();
    await assert.rejects(
        () => applyWindowsUpdate(config, 'invalid-tag'),
        { message: /Riferimento non valido/ }
    );
});
