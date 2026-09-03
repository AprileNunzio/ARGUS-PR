import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/storage/database.js';
import { invalidateSettings, setSetting } from '../src/features/settings/settings_repository.js';
import {
    coerce,
    describe as describeSettings,
    readSetting,
    updateSettings,
    resetSettings,
    remoteAccessEnabled,
    trustedNetworksFor,
    sessionTtlHoursFor,
    lockoutThresholds
} from '../src/features/settings/settings_service.js';
import { SETTINGS, GROUPS, RestartPolicy } from '../src/features/settings/settings_schema.js';

openDatabase({ databaseFile: ':memory:' });

test('ogni impostazione dichiara gruppo, tipo ed etichetta', () => {
    const groups = new Set(GROUPS.map((group) => group.id));

    for (const entry of SETTINGS) {
        assert.ok(entry.key.includes('.'), `chiave senza gruppo: ${entry.key}`);
        assert.ok(groups.has(entry.group), `gruppo sconosciuto in ${entry.key}`);
        assert.ok(entry.label.length > 0, `etichetta mancante in ${entry.key}`);
        assert.notEqual(entry.default, undefined, `default mancante in ${entry.key}`);
    }
});

test('i valori predefiniti superano la propria validazione', () => {
    for (const entry of SETTINGS) {
        assert.doesNotThrow(() => coerce(entry.key, entry.default), `default non valido in ${entry.key}`);
    }
});

test('la politica di riavvio predefinita chiede conferma', () => {
    resetSettings();
    assert.equal(readSetting('updates.restartPolicy'), RestartPolicy.ASK);
});

test('un valore fuori scala viene rifiutato', () => {
    assert.throws(() => coerce('security.sessionTtlHours', 0), /minimo/);
    assert.throws(() => coerce('security.sessionTtlHours', 1000), /massimo/);
    assert.throws(() => coerce('console.gridColumns', 99), /massimo/);
});

test('un orario mal formato viene rifiutato', () => {
    assert.equal(coerce('updates.windowStart', '03:00'), '03:00');
    assert.throws(() => coerce('updates.windowStart', '25:00'), /HH:MM/);
    assert.throws(() => coerce('updates.windowStart', '3:0'), /HH:MM/);
    assert.throws(() => coerce('updates.windowStart', 'notte'), /HH:MM/);
});

test('i giorni fuori intervallo o vuoti vengono rifiutati', () => {
    assert.deepEqual(coerce('updates.windowDays', [3, 1, 1]), [1, 3]);
    assert.throws(() => coerce('updates.windowDays', [7]), /da 0 a 6/);
    assert.throws(() => coerce('updates.windowDays', []), /almeno un giorno/);
});

test('una rete non valida non entra nelle reti fidate', () => {
    assert.deepEqual(coerce('access.trustedNetworks', ['10.8.0.0/24']), ['10.8.0.0/24']);
    assert.throws(() => coerce('access.trustedNetworks', ['10.8.0.0/99']));
    assert.throws(() => coerce('access.trustedNetworks', ['non-una-rete']));
});

test('una chiave sconosciuta viene rifiutata', () => {
    assert.throws(() => coerce('inventata.chiave', 1), /sconosciuta/);
    assert.throws(() => updateSettings({ 'inventata.chiave': 1 }), /sconosciuta/);
});

test('la scrittura restituisce solo le chiavi realmente cambiate', () => {
    resetSettings();

    const nessuna = updateSettings({ 'security.sessionTtlHours': readSetting('security.sessionTtlHours') });
    assert.equal(nessuna.length, 0);

    const cambiate = updateSettings({ 'security.sessionTtlHours': 24, 'console.gridColumns': 3 });
    assert.equal(cambiate.length, 2);
    assert.equal(readSetting('security.sessionTtlHours'), 24);
    assert.equal(readSetting('console.gridColumns'), 3);
});

test('una scrittura non valida non lascia modifiche parziali', () => {
    resetSettings();
    const prima = readSetting('security.sessionTtlHours');

    assert.throws(() => updateSettings({ 'security.sessionTtlHours': 24, 'updates.windowStart': 'rotto' }));
    assert.equal(readSetting('security.sessionTtlHours'), prima);
});

test('le impostazioni sensibili non finiscono nel dettaglio di audit', () => {
    resetSettings();
    const changes = updateSettings({ 'access.publicAccess': true });

    assert.equal(changes.length, 1);
    assert.equal(changes[0].sensitive, true);
});

test('la descrizione espone valore corrente e valore predefinito', () => {
    resetSettings();
    updateSettings({ 'console.gridColumns': 4 });

    const payload = describeSettings();
    const entry = payload.settings.find((item) => item.key === 'console.gridColumns');

    assert.equal(entry.value, 4);
    assert.equal(entry.default, 0);
    assert.equal(payload.groups.length, GROUPS.length);
});

test('un valore corrotto sul database ricade sul predefinito', () => {
    resetSettings();
    setSetting('security.sessionTtlHours', 'non un numero');
    invalidateSettings();

    assert.equal(readSetting('security.sessionTtlHours'), 12);
});

test('accesso remoto e reti fidate seguono le impostazioni, non solo l ambiente', () => {
    resetSettings();
    const config = {
        publicAccess: false,
        trustedNetworks: [],
        trustedNetworkList: [],
        sessionTtlHours: 12
    };

    assert.equal(remoteAccessEnabled(config), false);

    updateSettings({ 'access.publicAccess': true, 'access.trustedNetworks': ['10.8.0.0/24'] });

    assert.equal(remoteAccessEnabled(config), true);
    assert.equal(trustedNetworksFor(config).length, 1);
});

test('la durata della sessione e le soglie di blocco sono modificabili a caldo', () => {
    resetSettings();
    const config = { sessionTtlHours: 12, publicAccess: false, trustedNetworks: [], trustedNetworkList: [] };

    assert.equal(sessionTtlHoursFor(config), 12);

    updateSettings({
        'security.sessionTtlHours': 48,
        'security.lockoutSoftThreshold': 5,
        'security.lockoutMaxSeconds': 3600
    });

    assert.equal(sessionTtlHoursFor(config), 48);

    const rules = lockoutThresholds();
    assert.equal(rules.softThreshold, 5);
    assert.equal(rules.maxSeconds, 3600);
});
