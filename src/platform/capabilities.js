import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getHardwareProfile } from './hardware.js';
import { mediaToolsStatus } from './media_tools.js';
import { suggestedAnalysisFps } from '../features/settings/performance_tuning.js';

const run = promisify(execFile);

const HARDWARE_ENCODERS = new Set([
    'h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_vaapi', 'h264_videotoolbox', 'h264_v4l2m2m'
]);

const KNOWN_CODEC_MODULES = Object.freeze([
    { module: 'bcm2835-codec', hint: 'Broadcom VideoCore, presente su Raspberry Pi' },
    { module: 'rockchip-vpu', hint: 'Rockchip VPU, presente su RK3399 e derivati' },
    { module: 'hantro-vpu', hint: 'Hantro VPU, presente su i.MX8 e Rockchip' },
    { module: 's5p-mfc', hint: 'Samsung MFC, presente su Exynos' },
    { module: 'amphion-vpu', hint: 'Amphion VPU, presente su NXP i.MX8' }
]);

function readText(target) {
    try {
        return fs.readFileSync(target, 'utf8').replace(/\0/g, '').trim();
    } catch {
        return null;
    }
}

export function machineModel() {
    if (process.platform === 'linux') {
        return readText('/proc/device-tree/model')
            ?? readText('/sys/devices/virtual/dmi/id/product_name')
            ?? null;
    }
    return null;
}

export function videoDevices() {
    if (process.platform !== 'linux') return [];

    const entries = (() => {
        try {
            return fs.readdirSync('/dev').filter((name) => /^video\d+$/.test(name));
        } catch {
            return [];
        }
    })();

    return entries.map((name) => {
        const index = name.replace('video', '');
        const driver = readText(`/sys/class/video4linux/${name}/name`);
        const readable = (() => {
            try {
                fs.accessSync(path.join('/dev', name), fs.constants.R_OK | fs.constants.W_OK);
                return true;
            } catch {
                return false;
            }
        })();

        return { path: `/dev/${name}`, index: Number(index), driver, accessible: readable };
    }).sort((a, b) => a.index - b.index);
}

export function loadedModules() {
    const raw = readText('/proc/modules');
    if (!raw) return new Set();
    return new Set(raw.split('\n').map((line) => line.split(' ')[0].replace(/_/g, '-')));
}

export function availableCodecModules() {
    if (process.platform !== 'linux') return [];

    const release = os.release();
    const loaded = loadedModules();

    return KNOWN_CODEC_MODULES.map((entry) => {
        const present = ['ko', 'ko.xz', 'ko.gz', 'ko.zst'].some((extension) => {
            const direct = `/lib/modules/${release}/kernel/drivers/media/platform/${entry.module}.${extension}`;
            return fs.existsSync(direct);
        });

        const found = present || moduleExists(release, entry.module);

        return { ...entry, present: found, loaded: loaded.has(entry.module) };
    }).filter((entry) => entry.present || entry.loaded);
}

function moduleExists(release, moduleName) {
    const root = `/lib/modules/${release}`;
    if (!fs.existsSync(root)) return false;

    const stack = [root];
    let visited = 0;

    while (stack.length > 0 && visited < 4000) {
        const current = stack.pop();
        visited += 1;

        const entries = (() => {
            try {
                return fs.readdirSync(current, { withFileTypes: true });
            } catch {
                return [];
            }
        })();

        for (const entry of entries) {
            if (entry.isDirectory()) {
                stack.push(path.join(current, entry.name));
                continue;
            }
            if (entry.name.startsWith(`${moduleName}.ko`)) return true;
        }
    }

    return false;
}

export function thermalState() {
    if (process.platform !== 'linux') return { available: false };

    const zones = (() => {
        try {
            return fs.readdirSync('/sys/class/thermal').filter((name) => /^thermal_zone\d+$/.test(name));
        } catch {
            return [];
        }
    })();

    const readings = zones.map((zone) => {
        const milli = Number(readText(`/sys/class/thermal/${zone}/temp`));
        const type = readText(`/sys/class/thermal/${zone}/type`);
        return Number.isFinite(milli) ? { zone, type, celsius: Math.round(milli / 100) / 10 } : null;
    }).filter(Boolean);

    if (readings.length === 0) return { available: false };

    const hottest = readings.reduce((best, entry) => (entry.celsius > best.celsius ? entry : best));
    return { available: true, hottest, zones: readings };
}

export async function aiRuntime(config) {
    const workerScript = path.join(process.cwd(), 'vision', 'worker.py');
    if (!fs.existsSync(workerScript)) return { available: false, reason: 'worker assente' };

    const candidates = [
        path.join(config.dataDir, 'vision', 'venv', 'bin', 'python'),
        path.join(config.dataDir, 'vision', 'venv', 'Scripts', 'python.exe'),
        process.platform === 'win32' ? 'python' : 'python3'
    ];

    const binary = candidates.find((entry) => entry === 'python' || entry === 'python3' || fs.existsSync(entry));
    if (!binary) return { available: false, reason: 'interprete Python non trovato' };

    const outcome = await run(binary, [workerScript, '--probe'], { timeout: 20000, windowsHide: true, shell: false })
        .then((result) => JSON.parse(result.stdout))
        .catch((error) => ({ ok: false, error: error.message.slice(0, 200) }));

    if (!outcome.ok) return { available: false, reason: outcome.error ?? 'dipendenze mancanti', binary };

    return { available: true, binary, providers: outcome.providers ?? [] };
}

function buildSuggestions({ profile, media, devices, modules, encoders }) {
    const suggestions = [];
    const unloaded = modules.filter((entry) => !entry.loaded);

    if (process.platform === 'linux' && devices.length === 0 && unloaded.length > 0) {
        const entry = unloaded[0];
        suggestions.push({
            id: 'codec-module',
            severity: 'opportunity',
            title: 'Decodificatore video hardware presente ma non caricato',
            detail: `Il modulo ${entry.module} (${entry.hint}) esiste nel kernel ma non e attivo, quindi nessun dispositivo V4L2 e disponibile e video e browser lavorano solo con la CPU.`,
            command: `modprobe ${entry.module} && echo ${entry.module} > /etc/modules-load.d/argus-codec.conf`
        });
    }

    const unreachable = devices.filter((device) => !device.accessible);
    if (unreachable.length > 0) {
        suggestions.push({
            id: 'video-group',
            severity: 'warning',
            title: 'Dispositivi video non accessibili al servizio',
            detail: `${unreachable.map((device) => device.path).join(', ')} esistono ma il processo non puo aprirli: manca l appartenenza al gruppo video.`,
            command: 'usermod -aG video,render argus && systemctl restart argus-pr'
        });
    }

    if (media.available && encoders.hardware.length === 0) {
        suggestions.push({
            id: 'software-encoder',
            severity: 'info',
            title: 'Nessun encoder hardware verificato',
            detail: 'La transcodifica usera libx264 sulla CPU. Riguarda solo le telecamere il cui codec non puo essere copiato senza conversione, ad esempio H.265.',
            command: null
        });
    }

    if (profile.cpu.logicalCores <= 4) {
        suggestions.push({
            id: 'analysis-budget',
            severity: 'info',
            title: `Frequenza di analisi consigliata: ${suggestedAnalysisFps(profile)} fotogrammi al secondo`,
            detail: `Con ${profile.cpu.logicalCores} core logici, un valore piu alto produce un arretrato che il motore scarta comunque. E modificabile in Impostazioni, Prestazioni.`,
            command: null
        });
    }

    return suggestions;
}

export async function capabilityReport(config) {
    const profile = getHardwareProfile();
    const media = mediaToolsStatus();
    const devices = videoDevices();
    const modules = availableCodecModules();

    const usableEncoders = media.encoders ?? [];

    const encoders = {
        usable: usableEncoders,
        hardware: usableEncoders.filter((entry) => HARDWARE_ENCODERS.has(entry))
    };

    const ai = await aiRuntime(config);

    return {
        platform: {
            type: os.type(),
            release: os.release(),
            arch: os.arch(),
            model: machineModel(),
            hostname: os.hostname()
        },
        cpu: profile.cpu,
        memory: profile.memory,
        video: {
            ffmpeg: { available: media.available, version: media.ffmpegVersion, path: media.ffmpegPath },
            accelerators: { compiled: media.compiledAccelerators ?? [], usable: media.accelerators ?? [] },
            encoders,
            devices,
            codecModules: modules
        },
        ai,
        analysis: {
            cores: profile.cpu.logicalCores,
            suggestedFps: suggestedAnalysisFps(profile)
        },
        thermal: thermalState(),
        suggestions: buildSuggestions({ profile, media, devices, modules, encoders })
    };
}
