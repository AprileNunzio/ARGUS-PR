import test from 'node:test';
import assert from 'node:assert/strict';
import {
    classify,
    normaliseAddress,
    parseNetworks,
    allowsZone,
    isTrustedZone,
    Zone,
    Exposure
} from '../src/security/net_zones.js';

test('normalizza gli indirizzi mappati e i casi limite', () => {
    assert.equal(normaliseAddress('::ffff:192.168.1.7'), '192.168.1.7');
    assert.equal(normaliseAddress('  127.0.0.1 '), '127.0.0.1');
    assert.equal(normaliseAddress('localhost'), '127.0.0.1');
    assert.equal(normaliseAddress('[::1]'), '::1');
    assert.equal(normaliseAddress('fe80::1%eth0'), 'fe80::1');
    assert.equal(normaliseAddress(''), null);
});

test('classifica loopback, rete locale e internet', () => {
    assert.equal(classify('127.0.0.1'), Zone.LOCAL);
    assert.equal(classify('::1'), Zone.LOCAL);
    assert.equal(classify('::ffff:127.0.0.1'), Zone.LOCAL);
    assert.equal(classify('192.168.1.20'), Zone.LAN);
    assert.equal(classify('10.20.30.40'), Zone.LAN);
    assert.equal(classify('172.16.5.5'), Zone.LAN);
    assert.equal(classify('fd00::5'), Zone.LAN);
    assert.equal(classify('8.8.8.8'), Zone.WAN);
    assert.equal(classify('203.0.113.9'), Zone.WAN);
    assert.equal(classify('2001:db8::1'), Zone.WAN);
});

test('un indirizzo non valido o assente e trattato come internet', () => {
    assert.equal(classify('unknown'), Zone.WAN);
    assert.equal(classify(''), Zone.WAN);
    assert.equal(classify(null), Zone.WAN);
    assert.equal(classify('999.999.999.999'), Zone.WAN);
});

test('le reti dichiarate fidate diventano rete locale', () => {
    const trusted = parseNetworks(['203.0.113.0/24', '100.64.0.0/10']);

    assert.equal(classify('203.0.113.9', trusted), Zone.LAN);
    assert.equal(classify('100.100.1.1', trusted), Zone.LAN);
    assert.equal(classify('203.0.114.9', trusted), Zone.WAN);
    assert.equal(classify('198.51.100.1', trusted), Zone.WAN);
});

test('le rotte private non sono raggiungibili da internet', () => {
    assert.equal(allowsZone(Exposure.PRIVATE, Zone.WAN), false);
    assert.equal(allowsZone(Exposure.PRIVATE, Zone.LAN), true);
    assert.equal(allowsZone(Exposure.PRIVATE, Zone.LOCAL), true);
});

test('le rotte pubbliche sono raggiungibili ovunque e quelle locali solo dalla macchina', () => {
    assert.equal(allowsZone(Exposure.PUBLIC, Zone.WAN), true);
    assert.equal(allowsZone(Exposure.PUBLIC, Zone.LAN), true);
    assert.equal(allowsZone(Exposure.LOCAL, Zone.LAN), false);
    assert.equal(allowsZone(Exposure.LOCAL, Zone.WAN), false);
    assert.equal(allowsZone(Exposure.LOCAL, Zone.LOCAL), true);
});

test('solo loopback e rete locale sono zone fidate', () => {
    assert.equal(isTrustedZone(Zone.LOCAL), true);
    assert.equal(isTrustedZone(Zone.LAN), true);
    assert.equal(isTrustedZone(Zone.WAN), false);
    assert.equal(isTrustedZone(null), false);
});
