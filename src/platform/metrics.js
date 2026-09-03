import fs from 'node:fs';
import os from 'node:os';
import { getMemoryInfo, getHardwareProfile } from './hardware.js';

const PCI_VENDORS = Object.freeze({
    '0x8086': 'Intel',
    '0x10de': 'NVIDIA',
    '0x1002': 'AMD',
    '0x1022': 'AMD',
    '0x15ad': 'VMware',
    '0x1af4': 'VirtIO'
});

const BACKEND_LABELS = Object.freeze({
    cuda: 'CUDA',
    qsv: 'QSV',
    vaapi: 'VAAPI',
    d3d11va: 'D3D11VA',
    amf: 'AMF',
    videotoolbox: 'VideoToolbox',
    cpu: 'CPU'
});

let previous = null;
let gpuCache = null;

function cpuTotals() {
    let idle = 0;
    let total = 0;

    for (const cpu of os.cpus() ?? []) {
        for (const [kind, value] of Object.entries(cpu.times)) {
            total += value;
            if (kind === 'idle') idle += value;
        }
    }

    return { idle, total };
}

export function cpuUsagePercent() {
    const current = cpuTotals();

    if (!previous || current.total <= previous.total) {
        previous = current;
        return null;
    }

    const idleDelta = current.idle - previous.idle;
    const totalDelta = current.total - previous.total;
    previous = current;

    if (totalDelta <= 0) return null;

    return Math.round((1 - idleDelta / totalDelta) * 1000) / 10;
}

function readGpuVendor() {
    if (process.platform !== 'linux') return null;

    const base = '/sys/class/drm';
    if (!fs.existsSync(base)) return null;

    for (const entry of fs.readdirSync(base)) {
        if (!/^card\d+$/.test(entry)) continue;

        const vendorFile = `${base}/${entry}/device/vendor`;
        if (!fs.existsSync(vendorFile)) continue;

        const vendor = fs.readFileSync(vendorFile, 'utf8').trim().toLowerCase();
        const label = PCI_VENDORS[vendor];
        if (label) return label;
    }

    return null;
}

export function gpuSummary() {
    if (gpuCache) return gpuCache;

    const profile = (() => {
        try {
            return getHardwareProfile();
        } catch {
            return { availableBackends: ['cpu'] };
        }
    })();

    const backends = profile.availableBackends ?? ['cpu'];
    const active = backends.find((backend) => backend !== 'cpu') ?? 'cpu';

    const vendor = (() => {
        try {
            return readGpuVendor();
        } catch {
            return null;
        }
    })();

    gpuCache = {
        vendor,
        backend: BACKEND_LABELS[active] ?? active.toUpperCase(),
        accelerated: active !== 'cpu',
        label: vendor ? `${vendor} ${BACKEND_LABELS[active] ?? active}` : (BACKEND_LABELS[active] ?? active)
    };

    return gpuCache;
}

export function liveMetrics() {
    const memory = getMemoryInfo();

    return {
        cpuPercent: cpuUsagePercent(),
        memory: {
            usedPercent: memory.usedPercent,
            totalBytes: memory.totalBytes,
            freeBytes: memory.freeBytes
        },
        gpu: gpuSummary(),
        loadAverage: os.loadavg()[0],
        uptimeSeconds: Math.round(os.uptime())
    };
}
