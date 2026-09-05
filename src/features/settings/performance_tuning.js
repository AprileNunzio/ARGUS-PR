import os from 'node:os';
import { getHardwareProfile } from '../../platform/hardware.js';

export const PERFORMANCE_PRESETS = Object.freeze({
    MAX_PERFORMANCE: 'max_performance',
    BALANCED: 'balanced',
    POWER_SAVING: 'power_saving',
    CUSTOM: 'custom'
});

export const DEFAULT_PERFORMANCE_SETTINGS = Object.freeze({
    hwaccelBackend: 'auto',
    videoEncoder: 'auto',
    aiExecutionProvider: 'auto',
    cpuThreads: 0,
    aiIntraThreads: 0,
    aiInterThreads: 0,
    sqliteCacheSizeMb: 128,
    sqliteMmapSizeMb: 512,
    streamRingBufferKb: 4096,
    analysisFps: 0,
    performancePreset: 'max_performance'
});

export function suggestedAiThreads(profile = getHardwareProfile()) {
    const cores = profile.cpu.logicalCores || 1;
    if (cores <= 2) return 1;
    return Math.max(1, Math.floor(cores / 2));
}

export function suggestedAnalysisFps(profile = getHardwareProfile()) {
    const cores = profile.cpu.logicalCores || 1;
    if (cores <= 2) return 1;
    if (cores <= 4) return 2;
    if (cores <= 8) return 4;
    return 5;
}

export function getPresetSettings(presetName, profile = getHardwareProfile()) {
    const totalMemMb = Math.floor(profile.memory.totalBytes / (1024 * 1024));
    const logicalCores = profile.cpu.logicalCores || 1;

    switch (presetName) {
        case PERFORMANCE_PRESETS.MAX_PERFORMANCE:
            return {
                hwaccelBackend: 'auto',
                videoEncoder: 'auto',
                aiExecutionProvider: 'auto',
                cpuThreads: 0,
                aiIntraThreads: 0,
                aiInterThreads: 0,
                sqliteCacheSizeMb: Math.min(1024, Math.max(256, Math.floor(totalMemMb * 0.08))),
                sqliteMmapSizeMb: Math.min(4096, Math.max(1024, Math.floor(totalMemMb * 0.15))),
                streamRingBufferKb: 8192,
                analysisFps: suggestedAnalysisFps(profile),
                performancePreset: PERFORMANCE_PRESETS.MAX_PERFORMANCE
            };
        case PERFORMANCE_PRESETS.BALANCED:
            return {
                hwaccelBackend: 'auto',
                videoEncoder: 'auto',
                aiExecutionProvider: 'auto',
                cpuThreads: Math.max(1, Math.floor(logicalCores * 0.75)),
                aiIntraThreads: Math.max(1, Math.floor(logicalCores * 0.5)),
                aiInterThreads: 1,
                sqliteCacheSizeMb: 128,
                sqliteMmapSizeMb: 512,
                streamRingBufferKb: 4096,
                analysisFps: Math.max(1, suggestedAnalysisFps(profile) - 1),
                performancePreset: PERFORMANCE_PRESETS.BALANCED
            };
        case PERFORMANCE_PRESETS.POWER_SAVING:
            return {
                hwaccelBackend: 'none',
                videoEncoder: 'libx264',
                aiExecutionProvider: 'CPUExecutionProvider',
                cpuThreads: 1,
                aiIntraThreads: 1,
                aiInterThreads: 1,
                sqliteCacheSizeMb: 32,
                sqliteMmapSizeMb: 64,
                streamRingBufferKb: 2048,
                analysisFps: 1,
                performancePreset: PERFORMANCE_PRESETS.POWER_SAVING
            };
        default:
            return { ...DEFAULT_PERFORMANCE_SETTINGS };
    }
}

export function sanitizePerformanceSettings(input, profile = getHardwareProfile()) {
    const base = { ...DEFAULT_PERFORMANCE_SETTINGS, ...(typeof input === 'object' && input !== null ? input : {}) };
    const logicalCores = profile.cpu.logicalCores || 1;

    const validBackends = ['auto', 'none', 'cuda', 'qsv', 'vaapi', 'd3d11va', 'videotoolbox', 'amf'];
    const hwaccelBackend = validBackends.includes(base.hwaccelBackend) ? base.hwaccelBackend : 'auto';

    const validEncoders = ['auto', 'libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_vaapi', 'h264_videotoolbox'];
    const videoEncoder = validEncoders.includes(base.videoEncoder) ? base.videoEncoder : 'auto';

    const validAiProviders = [
        'auto',
        'CPUExecutionProvider',
        'CUDAExecutionProvider',
        'TensorrtExecutionProvider',
        'DmlExecutionProvider',
        'OpenVINOExecutionProvider'
    ];
    const aiExecutionProvider = validAiProviders.includes(base.aiExecutionProvider) ? base.aiExecutionProvider : 'auto';

    const cpuThreads = Math.max(0, Math.min(logicalCores * 2, Number(base.cpuThreads) || 0));

    const requestedIntra = Number(base.aiIntraThreads) || 0;
    const aiIntraThreads = requestedIntra > 0
        ? Math.min(logicalCores, Math.round(requestedIntra))
        : suggestedAiThreads(profile);

    const aiInterThreads = Math.max(1, Math.min(logicalCores, Number(base.aiInterThreads) || 1));

    const sqliteCacheSizeMb = Math.max(16, Math.min(2048, Number(base.sqliteCacheSizeMb) || 128));
    const sqliteMmapSizeMb = Math.max(0, Math.min(8192, Number(base.sqliteMmapSizeMb) || 512));
    const streamRingBufferKb = Math.max(1024, Math.min(32768, Number(base.streamRingBufferKb) || 4096));

    const requestedFps = Number(base.analysisFps) || 0;
    const analysisFps = requestedFps > 0
        ? Math.max(1, Math.min(15, Math.round(requestedFps)))
        : suggestedAnalysisFps(profile);

    const validPresets = Object.values(PERFORMANCE_PRESETS);
    const performancePreset = validPresets.includes(base.performancePreset) ? base.performancePreset : PERFORMANCE_PRESETS.CUSTOM;

    return {
        hwaccelBackend,
        videoEncoder,
        aiExecutionProvider,
        cpuThreads,
        aiIntraThreads,
        aiInterThreads,
        sqliteCacheSizeMb,
        sqliteMmapSizeMb,
        streamRingBufferKb,
        analysisFps,
        performancePreset
    };
}

export function applySqlitePerformance(db, settings) {
    const cacheKib = Math.max(16, settings.sqliteCacheSizeMb) * 1024;
    const mmapBytes = Math.max(0, settings.sqliteMmapSizeMb) * 1024 * 1024;
    const threads = Math.min(8, Math.max(1, os.cpus().length));

    db.pragma(`cache_size = -${cacheKib}`);
    db.pragma(`mmap_size = ${mmapBytes}`);
    db.pragma(`threads = ${threads}`);
    db.pragma('temp_store = MEMORY');
    db.pragma('synchronous = NORMAL');
}
