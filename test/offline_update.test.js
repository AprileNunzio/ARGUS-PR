import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanForBundles, verifyBundle } from '../src/features/updates/offline_update.js';
import { isZipFile, findExtractedRoot } from '../src/features/updates/zip_bundle.js';

function sandbox() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-offline-test-'));
    return {
        dir,
        cleanup: () => {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
        }
    };
}

test('isZipFile riconosce correttamente i file zip', () => {
    assert.equal(isZipFile('argus-pr-v0.40.0.zip'), true);
    assert.equal(isZipFile('UPDATE.ZIP'), true);
    assert.equal(isZipFile('argus-pr-v0.40.0.bundle'), false);
    assert.equal(isZipFile(null), false);
});

test('scanForBundles rileva sia file zip che file bundle', () => {
    const box = sandbox();
    try {
        fs.writeFileSync(path.join(box.dir, 'argus-pr-v0.40.0.zip'), 'dummy');
        fs.writeFileSync(path.join(box.dir, 'argus-pr-v0.39.0.bundle'), 'dummy');
        fs.writeFileSync(path.join(box.dir, 'ignored.txt'), 'dummy');

        const found = scanForBundles([box.dir]);
        assert.equal(found.length >= 2, true);

        const zipEntry = found.find((e) => e.name === 'argus-pr-v0.40.0.zip');
        const bundleEntry = found.find((e) => e.name === 'argus-pr-v0.39.0.bundle');

        assert.ok(zipEntry);
        assert.equal(zipEntry.isZip, true);
        assert.equal(zipEntry.tag, 'v0.40.0');

        assert.ok(bundleEntry);
        assert.equal(bundleEntry.isZip, false);
        assert.equal(bundleEntry.tag, 'v0.39.0');
    } finally {
        box.cleanup();
    }
});

test('findExtractedRoot individua la cartella con package.json', () => {
    const box = sandbox();
    try {
        const nested = path.join(box.dir, 'subfolder', 'nested-release');
        fs.mkdirSync(nested, { recursive: true });
        fs.writeFileSync(path.join(nested, 'package.json'), JSON.stringify({ name: 'argus-pr', version: '0.40.0' }));

        const root = findExtractedRoot(box.dir);
        assert.equal(root, nested);
    } finally {
        box.cleanup();
    }
});

test('verifyBundle rifiuta file inesistenti o non validi', async () => {
    await assert.rejects(
        () => verifyBundle('/percorso/non/esistente/argus-pr-v1.0.0.bundle'),
        { message: /non e un pacchetto ARGUS-PR valido/ }
    );
});
