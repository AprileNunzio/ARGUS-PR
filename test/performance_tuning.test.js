import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';

import {
    PERFORMANCE_PRESETS,
    DEFAULT_PERFORMANCE_SETTINGS,
    getPresetSettings,
    sanitizePerformanceSettings,
    applySqlitePerformance
} from '../src/features/settings/performance_tuning.js';

test('getPresetSettings genera configurazione per ogni preset', () => {
    const mockProfile = {
        cpu: { logicalCores: 8 },
        memory: { totalBytes: 16 * 1024 * 1024 * 1024 }
    };

    const maxPerf = getPresetSettings(PERFORMANCE_PRESETS.MAX_PERFORMANCE, mockProfile);
    assert.equal(maxPerf.performancePreset, 'max_performance');
    assert.equal(maxPerf.hwaccelBackend, 'auto');
    assert.equal(maxPerf.cpuThreads, 0);
    assert.ok(maxPerf.sqliteCacheSizeMb >= 256);

    const balanced = getPresetSettings(PERFORMANCE_PRESETS.BALANCED, mockProfile);
    assert.equal(balanced.performancePreset, 'balanced');
    assert.equal(balanced.cpuThreads, 6);

    const powerSaving = getPresetSettings(PERFORMANCE_PRESETS.POWER_SAVING, mockProfile);
    assert.equal(powerSaving.performancePreset, 'power_saving');
    assert.equal(powerSaving.hwaccelBackend, 'none');
    assert.equal(powerSaving.cpuThreads, 1);
});

test('sanitizePerformanceSettings normalizza input e valida limiti', () => {
    const mockProfile = {
        cpu: { logicalCores: 4 }
    };

    const sanitized = sanitizePerformanceSettings({
        hwaccelBackend: 'cuda',
        videoEncoder: 'h264_nvenc',
        aiExecutionProvider: 'CUDAExecutionProvider',
        cpuThreads: 99,
        sqliteCacheSizeMb: 5000,
        sqliteMmapSizeMb: 10000,
        streamRingBufferKb: 500
    }, mockProfile);

    assert.equal(sanitized.hwaccelBackend, 'cuda');
    assert.equal(sanitized.videoEncoder, 'h264_nvenc');
    assert.equal(sanitized.aiExecutionProvider, 'CUDAExecutionProvider');
    assert.equal(sanitized.cpuThreads, 8);
    assert.equal(sanitized.sqliteCacheSizeMb, 2048);
    assert.equal(sanitized.sqliteMmapSizeMb, 8192);
    assert.equal(sanitized.streamRingBufferKb, 1024);
});

test('applySqlitePerformance applica pragma prestazionali a database sqlite', () => {
    const tmpPath = path.join(os.tmpdir(), `argus-test-perf-${Date.now()}.db`);
    const db = new Database(tmpPath);
    const settings = {
        sqliteCacheSizeMb: 256,
        sqliteMmapSizeMb: 1024
    };

    applySqlitePerformance(db, settings);

    const cacheSize = db.pragma('cache_size', { simple: true });
    assert.equal(cacheSize, -262144);

    const mmapSize = db.pragma('mmap_size', { simple: true });
    assert.equal(mmapSize, 1073741824);

    db.close();
    try { fs.unlinkSync(tmpPath); } catch {}
});

