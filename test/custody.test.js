import test from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest, chainSources, chainRoot, canonicalJson, sealManifest, verifyManifest } from '../src/features/export/custody.js';

const KEY = Buffer.alloc(32, 7);

function source(index, sha) {
    return {
        file: `2026-09-02/2026090${index}-120000.mp4`,
        startedAt: 1756800000000 + index * 60000,
        durationMs: 60000,
        bytes: 1024 * index,
        sha256: sha ?? `${String(index).repeat(64)}`.slice(0, 64),
        verifiedSha256: sha ?? `${String(index).repeat(64)}`.slice(0, 64)
    };
}

function manifest(sources = [source(1), source(2), source(3)]) {
    return buildManifest({
        exportId: 'exp-1',
        product: 'ARGUS-PR 0.6.0',
        cameraId: 'cam-1',
        cameraName: 'Ingresso',
        fromMs: 1756800000000,
        toMs: 1756800180000,
        actorId: 'user-1',
        actorName: 'nunzio',
        address: '192.168.1.5',
        requestedAt: '2026-09-02T12:00:00.000Z',
        completedAt: '2026-09-02T12:00:04.000Z',
        reason: 'Richiesta autorita',
        outputName: 'export.mp4',
        outputBytes: 4096,
        outputSha256: 'a'.repeat(64),
        sources
    });
}

test('la serializzazione canonica non dipende dall ordine delle chiavi', () => {
    assert.equal(canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }));
    assert.notEqual(canonicalJson({ a: 1 }), canonicalJson({ a: 2 }));
});

test('la catena lega ogni segmento al precedente', () => {
    const chained = chainSources([source(1), source(2), source(3)]);

    assert.equal(chained.length, 3);
    assert.deepEqual(chained.map((item) => item.position), [0, 1, 2]);
    assert.equal(new Set(chained.map((item) => item.link)).size, 3);
});

test('cambiare un segmento cambia la radice della catena', () => {
    const before = chainRoot(chainSources([source(1), source(2), source(3)]));
    const after = chainRoot(chainSources([source(1), source(2), source(9)]));
    assert.notEqual(before, after);
});

test('riordinare i segmenti cambia la radice', () => {
    const before = chainRoot(chainSources([source(1), source(2)]));
    const after = chainRoot(chainSources([source(2), source(1)]));
    assert.notEqual(before, after);
});

test('una catena vuota ha una radice nulla definita', () => {
    assert.equal(chainRoot(chainSources([])), '0'.repeat(64));
});

test('un manifesto appena costruito si verifica', () => {
    const built = manifest();
    const seal = sealManifest(built, KEY);

    const outcome = verifyManifest(built, seal, KEY);
    assert.equal(outcome.valid, true);
    assert.deepEqual(outcome.problems, []);
    assert.equal(built.sourcesIntact, true);
});

test('modificare un campo del manifesto invalida l hash', () => {
    const built = manifest();
    const seal = sealManifest(built, KEY);

    const tampered = { ...built, range: { fromMs: 0, toMs: 1 } };
    const outcome = verifyManifest(tampered, seal, KEY);

    assert.equal(outcome.valid, false);
    assert.ok(outcome.problems.some((problem) => problem.includes('hash')));
});

test('un sigillo prodotto con un altra chiave non passa', () => {
    const built = manifest();
    const seal = sealManifest(built, Buffer.alloc(32, 9));

    const outcome = verifyManifest(built, seal, KEY);
    assert.equal(outcome.valid, false);
    assert.ok(outcome.problems.some((problem) => problem.includes('sigillo')));
});

test('sostituire un segmento lasciando la radice vecchia viene rilevato', () => {
    const built = manifest();
    built.sources[1].sha256 = 'f'.repeat(64);

    const outcome = verifyManifest(built, sealManifest(built, KEY), KEY);
    assert.equal(outcome.valid, false);
    assert.ok(outcome.problems.some((problem) => problem.includes('catena')));
});

test('un segmento alterato sul disco viene marcato non integro', () => {
    const broken = source(2);
    broken.verifiedSha256 = 'e'.repeat(64);

    const built = manifest([source(1), broken]);

    assert.equal(built.sourcesIntact, false);
    assert.equal(built.sources[1].intact, false);
    assert.equal(built.sources[0].intact, true);
});

test('il manifesto registra chi ha esportato, quando e perche', () => {
    const built = manifest();

    assert.equal(built.requestedBy.username, 'nunzio');
    assert.equal(built.requestedBy.address, '192.168.1.5');
    assert.equal(built.reason, 'Richiesta autorita');
    assert.equal(built.output.reencoded, false);
});
