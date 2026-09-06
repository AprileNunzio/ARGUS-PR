import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, isNewer, isReleaseTag, latestRelease, parseVersion } from '../src/features/updates/semver.js';

test('riconosce solo i tag di release ben formati', () => {
    assert.equal(isReleaseTag('v0.4.0'), true);
    assert.equal(isReleaseTag('v10.20.30'), true);
    assert.equal(isReleaseTag('0.4.0'), false);
    assert.equal(isReleaseTag('v0.4'), false);
    assert.equal(isReleaseTag('v01.4.0'), false);
    assert.equal(isReleaseTag('v0.4.0-beta'), false);
    assert.equal(isReleaseTag('main'), false);
    assert.equal(isReleaseTag('v0.4.0; rm -rf /'), false);
    assert.equal(isReleaseTag('../../etc/passwd'), false);
    assert.equal(isReleaseTag(null), false);
});

test('analizza le versioni con e senza prefisso', () => {
    assert.deepEqual(parseVersion('v1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: null });
    assert.deepEqual(parseVersion('1.2.3-rc.1'), { major: 1, minor: 2, patch: 3, prerelease: 'rc.1' });
    assert.equal(parseVersion('non una versione'), null);
});

test('ordina per componenti numerici, non alfabeticamente', () => {
    assert.equal(compareVersions('0.10.0', '0.9.0'), 1);
    assert.equal(compareVersions('1.0.0', '0.99.99'), 1);
    assert.equal(compareVersions('0.4.0', '0.4.0'), 0);
    assert.equal(compareVersions('0.4.1', '0.4.2'), -1);
});

test('una prerelease precede la release corrispondente', () => {
    assert.equal(compareVersions('1.0.0-rc.1', '1.0.0'), -1);
    assert.equal(compareVersions('1.0.0-rc.2', '1.0.0-rc.1'), 1);
    assert.equal(compareVersions('1.0.0-alpha', '1.0.0-beta'), -1);
});

test('isNewer non propone mai un downgrade', () => {
    assert.equal(isNewer('v0.5.0', '0.4.0'), true);
    assert.equal(isNewer('v0.4.0', '0.4.0'), false);
    assert.equal(isNewer('v0.3.0', '0.4.0'), false);
});

test('sceglie la release piu recente ignorando i riferimenti non validi', () => {
    assert.equal(latestRelease(['v0.2.0', 'main', 'v0.10.0', 'v0.9.0', 'bozza']), 'v0.10.0');
    assert.equal(latestRelease(['main', 'develop']), null);
    assert.equal(latestRelease([]), null);
});
