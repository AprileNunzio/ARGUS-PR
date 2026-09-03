import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { openDatabase, getDatabase } from '../src/storage/database.js';
import { initVault, decryptSecret } from '../src/security/vault.js';
import { Role } from '../src/security/rbac.js';
import { Zone } from '../src/security/net_zones.js';
import {
    createUser,
    login,
    verifyMfaLogin,
    setupMfa,
    confirmMfa,
    disableMfa,
    getMfaStatus,
    clearPendingChallenges
} from '../src/features/auth/auth_service.js';
import { deriveCode, base32Decode, resetReplayCache } from '../src/security/totp.js';
import { lockState } from '../src/security/lockout.js';
import { setSetting } from '../src/features/settings/settings_repository.js';

function setupTestEnv() {
    const tempDir = crypto.randomUUID();
    const secretsDir = process.env.TEMP || '/tmp';
    initVault({ secretsDir });
    openDatabase(':memory:');
}

test('flusso completo MFA: setup, conferma, login e codici di recupero', async () => {
    setupTestEnv();
    clearPendingChallenges();
    resetReplayCache();

    const user = await createUser({
        username: 'mfa_user_1',
        password: 'Password123!SafeLong',
        role: Role.OPERATOR
    });

    const statusInitial = getMfaStatus(user.id);
    assert.equal(statusInitial.enabled, false);

    const setup = await setupMfa(user.id);
    assert.ok(setup.secret.length >= 32);
    assert.ok(setup.uri.startsWith('otpauth://totp/ARGUS-PR:mfa_user_1?'));

    const dbRow = getDatabase().prepare('SELECT totp_secret, totp_enabled FROM users WHERE id = ?').get(user.id);
    assert.notEqual(dbRow.totp_secret, setup.secret);
    assert.equal(decryptSecret(dbRow.totp_secret), setup.secret);
    assert.equal(dbRow.totp_enabled, 0);

    await assert.rejects(async () => {
        await confirmMfa(user.id, '000000');
    });

    const step = Math.floor(Date.now() / 30000);
    const validCode = deriveCode(setup.secret, step);

    const confirmRes = await confirmMfa(user.id, validCode);
    assert.equal(confirmRes.ok, true);
    assert.equal(confirmRes.recoveryCodes.length, 10);

    const statusConfirmed = getMfaStatus(user.id);
    assert.equal(statusConfirmed.enabled, true);

    await assert.rejects(async () => {
        await setupMfa(user.id);
    });

    const loginRes = await login({
        username: 'mfa_user_1',
        password: 'Password123!SafeLong',
        remoteAddr: '192.168.1.50',
        ttlHours: 12,
        zone: Zone.LAN
    });

    assert.equal(loginRes.mfaRequired, true);
    assert.ok(loginRes.challenge);
    assert.equal(loginRes.session, undefined);

    await assert.rejects(async () => {
        await verifyMfaLogin({
            challenge: loginRes.challenge,
            code: '111111',
            remoteAddr: '192.168.1.50',
            zone: Zone.LAN
        });
    });

    const secondStep = Math.floor(Date.now() / 30000);
    const code2 = deriveCode(setup.secret, secondStep + 1);

    const mfaSuccess = await verifyMfaLogin({
        challenge: loginRes.challenge,
        code: code2,
        remoteAddr: '192.168.1.50',
        zone: Zone.LAN
    });

    assert.ok(mfaSuccess.session.token);
    assert.equal(mfaSuccess.profile.username, 'mfa_user_1');

    await assert.rejects(async () => {
        await verifyMfaLogin({
            challenge: loginRes.challenge,
            code: code2,
            remoteAddr: '192.168.1.50',
            zone: Zone.LAN
        });
    });

    const loginRes2 = await login({
        username: 'mfa_user_1',
        password: 'Password123!SafeLong',
        remoteAddr: '192.168.1.50',
        ttlHours: 12,
        zone: Zone.LAN
    });

    const recoveryCode = confirmRes.recoveryCodes[0];
    const recoveryLogin = await verifyMfaLogin({
        challenge: loginRes2.challenge,
        code: recoveryCode,
        remoteAddr: '192.168.1.50',
        zone: Zone.LAN
    });
    assert.ok(recoveryLogin.session.token);

    const loginRes3 = await login({
        username: 'mfa_user_1',
        password: 'Password123!SafeLong',
        remoteAddr: '192.168.1.50',
        ttlHours: 12,
        zone: Zone.LAN
    });

    await assert.rejects(async () => {
        await verifyMfaLogin({
            challenge: loginRes3.challenge,
            code: recoveryCode,
            remoteAddr: '192.168.1.50',
            zone: Zone.LAN
        });
    });
});

test('i codici MFA errati ripetuti innescano il lockout dell account', async () => {
    setupTestEnv();
    clearPendingChallenges();

    const user = await createUser({
        username: 'mfa_lockout_user',
        password: 'Password123!SafeLong',
        role: Role.VIEWER
    });

    const setup = await setupMfa(user.id);
    const step = Math.floor(Date.now() / 30000);
    await confirmMfa(user.id, deriveCode(setup.secret, step));

    for (let i = 0; i < 3; i++) {
        const loginRes = await login({
            username: 'mfa_lockout_user',
            password: 'Password123!SafeLong',
            remoteAddr: '192.168.1.50',
            ttlHours: 12,
            zone: Zone.LAN
        });

        await assert.rejects(async () => {
            await verifyMfaLogin({
                challenge: loginRes.challenge,
                code: '999999',
                remoteAddr: '192.168.1.50',
                zone: Zone.LAN
            });
        });
    }

    const state = lockState('mfa_lockout_user');
    assert.equal(state.locked, true);
    assert.ok(state.retryAfterSeconds > 0);
});

test('un admin da WAN viene rifiutato anche se possiede MFA', async () => {
    setupTestEnv();
    clearPendingChallenges();

    const admin = await createUser({
        username: 'mfa_admin_wan',
        password: 'Password123!SafeLong',
        role: Role.ADMIN
    });

    const setup = await setupMfa(admin.id);
    const step = Math.floor(Date.now() / 30000);
    await confirmMfa(admin.id, deriveCode(setup.secret, step));

    await assert.rejects(async () => {
        await login({
            username: 'mfa_admin_wan',
            password: 'Password123!SafeLong',
            remoteAddr: '203.0.113.88',
            ttlHours: 12,
            zone: Zone.WAN
        });
    });
});

test('disabilitazione MFA rispetta la politica per gli amministratori', async () => {
    setupTestEnv();
    clearPendingChallenges();

    const admin = await createUser({
        username: 'mfa_admin_disable',
        password: 'Password123!SafeLong',
        role: Role.ADMIN
    });

    const setup = await setupMfa(admin.id);
    const step = Math.floor(Date.now() / 30000);
    const code = deriveCode(setup.secret, step);
    await confirmMfa(admin.id, code);

    setSetting('security.mfaRequiredForAdmin', true);

    await assert.rejects(async () => {
        await disableMfa(admin, {
            password: 'Password123!SafeLong',
            code
        });
    });

    setSetting('security.mfaRequiredForAdmin', false);

    const nextStep = Math.floor(Date.now() / 30000) + 1;
    const nextCode = deriveCode(setup.secret, nextStep);
    const disabled = await disableMfa(admin, {
        password: 'Password123!SafeLong',
        code: nextCode
    });
    assert.equal(disabled.ok, true);

    const statusAfter = getMfaStatus(admin.id);
    assert.equal(statusAfter.enabled, false);
});

test('il segreto TOTP e i codici di recupero non compaiono nella sessione ne nell audit', async () => {
    setupTestEnv();
    clearPendingChallenges();

    const user = await createUser({
        username: 'mfa_leak_check',
        password: 'Password123!SafeLong',
        role: Role.OPERATOR
    });

    const setup = await setupMfa(user.id);
    const step = Math.floor(Date.now() / 30000);
    const code = deriveCode(setup.secret, step);
    const confirm = await confirmMfa(user.id, code);

    const loginRes = await login({
        username: 'mfa_leak_check',
        password: 'Password123!SafeLong',
        remoteAddr: '192.168.1.50',
        ttlHours: 12,
        zone: Zone.LAN
    });

    const nextStep = Math.floor(Date.now() / 30000) + 1;
    const loginOk = await verifyMfaLogin({
        challenge: loginRes.challenge,
        code: deriveCode(setup.secret, nextStep),
        remoteAddr: '192.168.1.50',
        zone: Zone.LAN
    });

    const sessionJson = JSON.stringify(loginOk);
    assert.equal(sessionJson.includes(setup.secret), false);
    for (const rc of confirm.recoveryCodes) {
        assert.equal(sessionJson.includes(rc), false);
    }

    const auditRows = getDatabase().prepare('SELECT * FROM audit_log WHERE actor_id = ?').all(user.id);
    const auditJson = JSON.stringify(auditRows);
    assert.equal(auditJson.includes(setup.secret), false);
    for (const rc of confirm.recoveryCodes) {
        assert.equal(auditJson.includes(rc), false);
    }
});

