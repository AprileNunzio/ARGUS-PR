import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readManifest, readCatalog, clearCatalogCache } from '../src/features/i18n/i18n_service.js';
import { projectRoot } from '../src/platform/paths.js';

const LOCALES_ROOT = path.join(projectRoot, 'locales');

test('manifest principale e valido e contiene le lingue supportate', () => {
    const manifest = readManifest();
    assert.equal(manifest.defaultLocale, 'it');
    assert.equal(manifest.fallbackLocale, 'en');
    assert.ok(Array.isArray(manifest.supportedLocales));
    assert.ok(manifest.supportedLocales.some((l) => l.code === 'it'));
    assert.ok(manifest.supportedLocales.some((l) => l.code === 'en'));
});

test('tutti i file JSON dei cataloghi sono sintatticamente validi', () => {
    const walk = (dir) => {
        let results = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results = results.concat(walk(fullPath));
            } else if (entry.name.endsWith('.json')) {
                results.push(fullPath);
            }
        }
        return results;
    };

    const jsonFiles = walk(LOCALES_ROOT);
    assert.ok(jsonFiles.length > 0);

    for (const file of jsonFiles) {
        const content = fs.readFileSync(file, 'utf8');
        assert.doesNotThrow(() => JSON.parse(content));
    }
});

test('parita delle chiavi tra italiano e inglese per ogni namespace comune', () => {
    const itFiles = fs.readdirSync(path.join(LOCALES_ROOT, 'it')).filter((f) => f.endsWith('.json'));
    const enFiles = fs.readdirSync(path.join(LOCALES_ROOT, 'en')).filter((f) => f.endsWith('.json'));

    assert.deepEqual(itFiles.sort(), enFiles.sort());

    for (const filename of itFiles) {
        const itContent = JSON.parse(fs.readFileSync(path.join(LOCALES_ROOT, 'it', filename), 'utf8'));
        const enContent = JSON.parse(fs.readFileSync(path.join(LOCALES_ROOT, 'en', filename), 'utf8'));

        const itKeys = Object.keys(itContent).sort();
        const enKeys = Object.keys(enContent).sort();

        assert.deepEqual(itKeys, enKeys, 'Discrepanza chiavi nel namespace ' + filename);
    }
});

test('lettura sicura catalogo e fallback con i18n_service', () => {
    clearCatalogCache();
    const commonIt = readCatalog('it', 'common');
    assert.equal(commonIt.save, 'Salva');

    const commonEn = readCatalog('en', 'common');
    assert.equal(commonEn.save, 'Save');
});

test('blocco path traversal e parametri non validi in i18n_service', () => {
    assert.throws(() => readCatalog('..', 'common'), { code: 'VALIDATION' });
    assert.throws(() => readCatalog('it', '../etc/passwd'), { code: 'VALIDATION' });
    assert.throws(() => readCatalog('invalid-locale-format', 'common'), { code: 'VALIDATION' });
});
