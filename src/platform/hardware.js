import os from 'node:os';
import { getMediaTools } from './media_tools.js';

export function getCpuInfo() {
    const cpus = os.cpus() || [];
    const model = cpus[0]?.model || 'Unknown CPU';
    const logicalCores = cpus.length;
    const speed = cpus[0]?.speed || 0;
    return {
        model,
        logicalCores,
        speedMhz: speed,
        arch: os.arch()
    };
}

export function getMemoryInfo() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const usedPct = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
    const defaultCacheMb = Math.min(1024, Math.max(64, Math.floor((total / (1024 * 1024)) * 0.05)));
    const defaultMmapMb = Math.min(2048, Math.max(128, Math.floor((total / (1024 * 1024)) * 0.10)));

    return {
        totalBytes: total,
        freeBytes: free,
        usedBytes: used,
        usedPercent: usedPct,
        recommendedCacheMb: defaultCacheMb,
        recommendedMmapMb: defaultMmapMb
    };
}

export function getHardwareProfile() {
    const cpu = getCpuInfo();
    const memory = getMemoryInfo();

    let ffmpegAccelerators = [];
    try {
        const tools = getMediaTools();
        ffmpegAccelerators = tools.accelerators || [];
    } catch {
        ffmpegAccelerators = [];
    }

    const availableBackends = ['cpu'];
    if (ffmpegAccelerators.includes('cuda')) availableBackends.push('cuda');
    if (ffmpegAccelerators.includes('qsv')) availableBackends.push('qsv');
    if (ffmpegAccelerators.includes('vaapi')) availableBackends.push('vaapi');
    if (ffmpegAccelerators.includes('d3d11va') || ffmpegAccelerators.includes('dxva2')) availableBackends.push('d3d11va');
    if (ffmpegAccelerators.includes('amf')) availableBackends.push('amf');
    if (ffmpegAccelerators.includes('videotoolbox')) availableBackends.push('videotoolbox');

    const availableAiProviders = ['CPUExecutionProvider'];
    if (availableBackends.includes('cuda')) {
        availableAiProviders.unshift('CUDAExecutionProvider', 'TensorrtExecutionProvider');
    }
    if (process.platform === 'win32') {
        availableAiProviders.push('DmlExecutionProvider');
    }
    if (availableBackends.includes('qsv')) {
        availableAiProviders.push('OpenVINOExecutionProvider');
    }

    return {
        cpu,
        memory,
        accelerators: ffmpegAccelerators,
        availableBackends,
        availableAiProviders
    };
}
