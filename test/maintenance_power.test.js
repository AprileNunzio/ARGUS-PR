import test from 'node:test';
import assert from 'node:assert/strict';
import { powerAttempts, cleanFailure, POWER_REMEDY } from '../src/features/system/maintenance_service.js';

test('la catena di riavvio prova anche le varianti forzate e i percorsi assoluti', () => {
    const attempts = powerAttempts('reboot').map(([command, args]) => [command, ...args].join(' '));

    assert.ok(attempts.includes('systemctl --no-block reboot'));
    assert.ok(attempts.includes('/usr/bin/systemctl --force --no-block reboot'));
    assert.ok(attempts.includes('/sbin/shutdown -r now'));
    assert.ok(attempts.includes('/usr/bin/sudo -n /sbin/shutdown -r now'));
    assert.ok(attempts.includes('/sbin/reboot --force'));
});

test('lo spegnimento non usa mai gli argomenti del riavvio', () => {
    const attempts = powerAttempts('poweroff').map(([command, args]) => [command, ...args].join(' '));

    assert.ok(attempts.every((entry) => !entry.includes('reboot')));
    assert.ok(attempts.includes('/sbin/shutdown -h now'));
    assert.ok(attempts.includes('/sbin/poweroff --force'));
});

test('ogni comando viene passato come array, senza shell', () => {
    for (const [command, args] of powerAttempts('reboot')) {
        assert.equal(typeof command, 'string');
        assert.ok(Array.isArray(args));
        assert.ok(args.every((entry) => typeof entry === 'string'));
    }
});

test('il rumore di systemd non nasconde la vera causa del rifiuto', () => {
    const cleaned = cleanFailure([
        'Command failed: systemctl --no-block reboot',
        'Failed to set wall message, ignoring: Unit dbus-org.freedesktop.login1.service failed to load',
        'Interactive authentication required.'
    ].join('\n'));

    assert.ok(cleaned.includes('Interactive authentication required.'));
    assert.ok(!cleaned.includes('wall message'));
});

test('un messaggio vuoto non produce un dettaglio vuoto', () => {
    assert.equal(cleanFailure(''), 'nessun dettaglio');
    assert.equal(cleanFailure(null), 'nessun dettaglio');
});

test('il rimedio indica file che esistono davvero nel repository', () => {
    assert.match(POWER_REMEDY, /argus-maintenance\.sudoers/);
    assert.match(POWER_REMEDY, /argus-maintenance\.rules/);
});
