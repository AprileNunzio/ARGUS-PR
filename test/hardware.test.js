import test from 'node:test';
import assert from 'node:assert/strict';
import { getCpuInfo, getMemoryInfo, getHardwareProfile } from '../src/platform/hardware.js';

test('getCpuInfo rileva caratteristiche del processore', () => {
    const cpu = getCpuInfo();
    assert.ok(typeof cpu.model === 'string' && cpu.model.length > 0);
    assert.ok(typeof cpu.logicalCores === 'number' && cpu.logicalCores >= 1);
    assert.ok(typeof cpu.arch === 'string');
});

test('getMemoryInfo calcola memoria e soglie consigliate', () => {
    const mem = getMemoryInfo();
    assert.ok(typeof mem.totalBytes === 'number' && mem.totalBytes > 0);
    assert.ok(typeof mem.freeBytes === 'number' && mem.freeBytes >= 0);
    assert.ok(typeof mem.recommendedCacheMb === 'number' && mem.recommendedCacheMb >= 64);
    assert.ok(typeof mem.recommendedMmapMb === 'number' && mem.recommendedMmapMb >= 128);
});

test('getHardwareProfile costruisce profilo completo di sistema', () => {
    const profile = getHardwareProfile();
    assert.ok(profile.cpu);
    assert.ok(profile.memory);
    assert.ok(Array.isArray(profile.accelerators));
    assert.ok(Array.isArray(profile.availableBackends));
    assert.ok(profile.availableBackends.includes('cpu'));
    assert.ok(Array.isArray(profile.availableAiProviders));
    assert.ok(profile.availableAiProviders.includes('CPUExecutionProvider'));
});
