import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/storage/database.js';
import { assertNotLocked, recordFailure, recordSuccess, lockState } from '../src/security/lockout.js';

openDatabase({ databaseFile: ':memory:' });

let counter = 0;

function user() {
    counter += 1;
    return `utente-${counter}`;
}

test('i primi tentativi falliti non bloccano subito', () => {
    const name = user();

    assert.equal(recordFailure(name).locked, false);
    assert.equal(recordFailure(name).locked, false);
    assert.equal(lockState(name).locked, false);
});

test('al terzo fallimento scatta l attesa progressiva', () => {
    const name = user();

    recordFailure(name);
    recordFailure(name);
    const third = recordFailure(name);

    assert.equal(third.locked, true);
    assert.equal(third.retryAfterSeconds, 30);

    assert.equal(recordFailure(name).retryAfterSeconds, 60);
    assert.equal(recordFailure(name).retryAfterSeconds, 120);
});

test('l attesa non supera mai il tetto massimo', () => {
    const name = user();

    let last = null;
    for (let index = 0; index < 9; index += 1) last = recordFailure(name);

    assert.equal(last.retryAfterSeconds, 1800);

    const tenth = recordFailure(name);
    assert.equal(tenth.retryAfterSeconds, 3600);
    assert.equal(tenth.failures, 10);
});

test('un account bloccato rifiuta il tentativo prima di verificare la password', () => {
    const name = user();

    for (let index = 0; index < 3; index += 1) recordFailure(name);

    assert.throws(() => assertNotLocked(name), (error) => {
        assert.equal(error.code, 'RATE_LIMITED');
        assert.ok(error.details.retryAfterSeconds > 0);
        return true;
    });
});

test('un accesso riuscito azzera il contatore', () => {
    const name = user();

    for (let index = 0; index < 4; index += 1) recordFailure(name);
    recordSuccess(name);

    assert.equal(lockState(name).locked, false);
    assert.equal(lockState(name).failures, 0);
    assert.doesNotThrow(() => assertNotLocked(name));
});

test('il blocco di un utente non tocca gli altri', () => {
    const bloccato = user();
    const libero = user();

    for (let index = 0; index < 5; index += 1) recordFailure(bloccato);

    assert.equal(lockState(bloccato).locked, true);
    assert.equal(lockState(libero).locked, false);
    assert.doesNotThrow(() => assertNotLocked(libero));
});
