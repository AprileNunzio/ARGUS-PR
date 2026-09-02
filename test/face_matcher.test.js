import test from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity, isFaceMatch, mergeEmbeddings, findBestMatch } from '../src/features/vision/face_matcher.js';

test('cosineSimilarity calcola correlazione identica e ortogonale', () => {
    const v1 = [1, 0, 0, 0];
    const v2 = [1, 0, 0, 0];
    const v3 = [0, 1, 0, 0];

    assert.ok(Math.abs(cosineSimilarity(v1, v2) - 1.0) < 1e-6);
    assert.equal(cosineSimilarity(v1, v3), 0);
});

test('isFaceMatch rispetta la soglia standard SFace di 0.363', () => {
    const base = [1, 0];
    const matchSim = [0.9, 0.435];
    const nonMatchSim = [0.2, 0.98];

    assert.equal(isFaceMatch(base, matchSim), true);
    assert.equal(isFaceMatch(base, nonMatchSim), false);
});

test('mergeEmbeddings produce un centroide a norma unitaria', () => {
    const emb1 = [1, 0, 0];
    const emb2 = [0, 1, 0];
    const merged = mergeEmbeddings([emb1, emb2]);

    assert.ok(merged);
    assert.equal(merged.length, 3);
    const norm = Math.sqrt(merged.reduce((acc, val) => acc + val * val, 0));
    assert.ok(Math.abs(norm - 1.0) < 1e-4);
    assert.ok(Math.abs(merged[0] - merged[1]) < 1e-4);
});

test('findBestMatch identifica la persona con score massimo', () => {
    const candidate = [1, 0, 0];
    const people = [
        { id: '1', name: 'Mario', embedding: [0.1, 0.9, 0] },
        { id: '2', name: 'Luigi', embedding: [0.95, 0.1, 0] }
    ];

    const match = findBestMatch(candidate, people, 0.363);
    assert.ok(match);
    assert.equal(match.person.name, 'Luigi');
    assert.ok(match.score > 0.9);
});
