import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadShieldConfig } from '../src/config.js';
import { createShield } from '../src/service.js';
import { buildRuleset } from '../src/ruleset.js';
import { createBanlist } from '../src/banlist.js';
import { createDetector } from '../src/detectors.js';
import { isAddress, inAnyNetwork, parseNetworks } from '../src/addresses.js';

function scratch() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'argus-shield-'));
}

function configFor(dir, overrides = {}) {
    return loadShieldConfig({
        configFile: path.join(dir, 'absent.json'),
        stateDir: dir,
        eventsFile: path.join(dir, 'events.jsonl'),
        ...overrides
    });
}

function write(file, events) {
    fs.appendFileSync(file, events.map((event) => JSON.stringify(event)).join('\n') + '\n');
}

async function settle(ms = 1400) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

test('gli indirizzi validi sono riconosciuti e quelli malformati respinti', () => {
    assert.equal(isAddress('192.168.1.10'), true);
    assert.equal(isAddress('2001:db8::1'), true);
    assert.equal(isAddress('999.1.1.1'), false);
    assert.equal(isAddress('1.2.3.4; nft flush ruleset'), false);
    assert.equal(isAddress(''), false);
});

test('la classificazione delle reti riconosce le CIDR locali', () => {
    const networks = parseNetworks(['10.0.0.0/8', '192.168.0.0/16', 'fc00::/7']);
    assert.equal(inAnyNetwork('10.4.5.6', networks), true);
    assert.equal(inAnyNetwork('192.168.1.1', networks), true);
    assert.equal(inAnyNetwork('8.8.8.8', networks), false);
    assert.equal(inAnyNetwork('fd00::1', networks), true);
});

test('il ruleset contiene politica di rifiuto e porte pubbliche', () => {
    const dir = scratch();
    const ruleset = buildRuleset(configFor(dir));

    assert.match(ruleset, /policy drop/);
    assert.match(ruleset, /tcp dport \{ 443, 80 \} accept/);
    assert.match(ruleset, /udp sport 67 udp dport 68 accept/);
    assert.match(ruleset, /ip saddr @banned4 counter drop/);
    assert.match(ruleset, /chain forward/);
});

test('il punteggio cresce e scatta il blocco oltre la soglia', () => {
    const dir = scratch();
    const banlist = createBanlist(configFor(dir, { scoreThreshold: 9 }));

    assert.equal(banlist.register('203.0.113.5', 3, 'auth.failure'), null);
    assert.equal(banlist.register('203.0.113.5', 3, 'auth.failure'), null);

    const decision = banlist.register('203.0.113.5', 3, 'auth.failure');
    assert.ok(decision);
    assert.equal(decision.address, '203.0.113.5');
    assert.equal(decision.strikes, 1);
    assert.equal(banlist.active().length, 1);
});

test('la recidiva allunga il blocco fino al tetto massimo', () => {
    const dir = scratch();
    const config = configFor(dir, { banSeconds: 60, maxBanSeconds: 3600 });
    const banlist = createBanlist(config);

    const first = banlist.forceBan('198.51.100.7', config.banSeconds, 'test');
    assert.equal(first.strikes, 1);

    banlist.release('198.51.100.7');
    const second = banlist.register('198.51.100.7', 50, 'auth.failure');
    assert.ok(second);
    assert.equal(second.seconds, 240);
});

test('gli indirizzi locali e in allowlist non vengono mai bloccati', () => {
    const dir = scratch();
    const detector = createDetector(configFor(dir, { allowlist: ['203.0.113.9'] }));

    assert.equal(detector.isProtected('192.168.1.50'), true);
    assert.equal(detector.isProtected('203.0.113.9'), true);
    assert.equal(detector.isProtected('203.0.113.10'), false);
});

test('un accesso amministrativo da internet viene bloccato subito', async () => {
    const dir = scratch();
    const config = configFor(dir);
    fs.writeFileSync(config.eventsFile, '');

    const shield = await createShield(config, 'report-only');
    const session = await shield.watch({ fromBeginning: true });

    write(config.eventsFile, [
        { at: new Date().toISOString(), kind: 'auth.admin_from_wan', address: '203.0.113.66', zone: 'wan', username: 'admin' }
    ]);

    await settle();
    const status = await shield.status();
    session.stop();

    assert.equal(status.banned.length, 1);
    assert.equal(status.banned[0].address, '203.0.113.66');
});

test('i tentativi di accesso falliti portano al blocco, il successo abbassa il punteggio', async () => {
    const dir = scratch();
    const config = configFor(dir);
    fs.writeFileSync(config.eventsFile, '');

    const shield = await createShield(config, 'report-only');
    const session = await shield.watch({ fromBeginning: true });

    const failure = (address) => ({ at: new Date().toISOString(), kind: 'auth.failure', address, zone: 'wan' });

    write(config.eventsFile, [failure('203.0.113.20'), failure('203.0.113.20'), failure('203.0.113.20')]);
    await settle();

    let status = await shield.status();
    assert.equal(status.banned.length, 0, 'tre tentativi non bastano');

    write(config.eventsFile, [failure('203.0.113.20')]);
    await settle();

    status = await shield.status();
    session.stop();

    assert.equal(status.banned.length, 1);
    assert.equal(status.banned[0].address, '203.0.113.20');
});

test('gli eventi provenienti dalla rete locale non causano blocchi', async () => {
    const dir = scratch();
    const config = configFor(dir);
    fs.writeFileSync(config.eventsFile, '');

    const shield = await createShield(config, 'report-only');
    const session = await shield.watch({ fromBeginning: true });

    write(config.eventsFile, new Array(10).fill(null).map(() => ({
        at: new Date().toISOString(),
        kind: 'auth.failure',
        address: '192.168.1.44',
        zone: 'lan'
    })));

    await settle();
    const status = await shield.status();
    session.stop();

    assert.equal(status.banned.length, 0);
});

test('le righe corrotte nel flusso eventi non fermano la sorveglianza', async () => {
    const dir = scratch();
    const config = configFor(dir);
    fs.writeFileSync(config.eventsFile, '');

    const shield = await createShield(config, 'report-only');
    const session = await shield.watch({ fromBeginning: true });

    fs.appendFileSync(config.eventsFile, 'non json\n{"rotto":\n');
    write(config.eventsFile, [
        { at: new Date().toISOString(), kind: 'auth.admin_from_wan', address: '203.0.113.77', zone: 'wan' }
    ]);

    await settle();
    const status = await shield.status();
    session.stop();

    assert.equal(status.banned.length, 1);
    assert.equal(status.banned[0].address, '203.0.113.77');
});
