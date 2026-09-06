import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisSizeFor, isWideSource } from '../src/features/vision/analysis_geometry.js';

test('una sorgente 16:9 mantiene il fotogramma di analisi standard', () => {
    assert.deepEqual(analysisSizeFor(1920, 1080), { width: 640, height: 360 });
    assert.deepEqual(analysisSizeFor(1280, 720), { width: 640, height: 360 });
});

test('il fotogramma di analisi conserva sempre l aspetto della sorgente', () => {
    const sources = [[1920, 1080], [1440, 1080], [640, 480], [2688, 1520], [3840, 1080], [1280, 960]];
    for (const [width, height] of sources) {
        const size = analysisSizeFor(width, height);
        const error = Math.abs(size.width / size.height - width / height) / (width / height);
        assert.ok(error < 0.005, `${width}x${height} deformato di ${(error * 100).toFixed(2)}%`);
    }
});

test('una sorgente 4:3 non viene stirata al 16:9', () => {
    assert.deepEqual(analysisSizeFor(1440, 1080), { width: 480, height: 360 });
    assert.deepEqual(analysisSizeFor(640, 480), { width: 480, height: 360 });
});

test('una panoramica 32:9 riceve un fotogramma piu largo che conserva l aspetto', () => {
    const size = analysisSizeFor(3840, 1080);
    assert.deepEqual(size, { width: 1920, height: 540 });
    assert.ok(Math.abs(size.width / size.height - 3840 / 1080) < 0.01);
});

test('il fotogramma di analisi resta entro il budget di pixel', () => {
    const size = analysisSizeFor(8000, 1000);
    assert.ok(size.width * size.height <= 1920 * 540 + 4096);
    assert.ok(Math.abs(size.width / size.height - 8) < 0.1);
});

test('una risoluzione ignota ricade sul valore predefinito', () => {
    assert.deepEqual(analysisSizeFor(null, null), { width: 640, height: 360 });
    assert.deepEqual(analysisSizeFor(0, 0), { width: 640, height: 360 });
    assert.deepEqual(analysisSizeFor('abc', 720), { width: 640, height: 360 });
});

test('le dimensioni prodotte sono sempre pari', () => {
    for (const [w, h] of [[3840, 1080], [5000, 1234], [2560, 720], [7680, 1080]]) {
        const size = analysisSizeFor(w, h);
        assert.equal(size.width % 2, 0);
        assert.equal(size.height % 2, 0);
    }
});

test('isWideSource distingue il 16:9 dalla panoramica', () => {
    assert.equal(isWideSource(1920, 1080), false);
    assert.equal(isWideSource(3840, 1080), true);
    assert.equal(isWideSource(null, null), false);
});
