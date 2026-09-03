import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { statSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isLocalKind } from './camera_input.js';
import { listLocalDevices } from './local_devices.js';
import { localCaptureState } from './local_capture.js';
import { probeSource } from './stream_probe.js';
import { trialFrames, trialPreview, trialRecording, trialVisionFrames } from './capture_trial.js';

export const LOCAL_STEPS = Object.freeze(['presence', 'capabilities', 'open', 'format', 'preview', 'record', 'analysis']);
export const NETWORK_STEPS = Object.freeze(['reachability', 'probe', 'transport', 'preview', 'record', 'analysis']);

const STEP_LABELS = Object.freeze({
    presence: 'Periferica presente',
    capabilities: 'Formati supportati',
    open: 'Apertura del flusso',
    format: 'Scelta del formato migliore',
    reachability: 'Raggiungibilita di rete',
    probe: 'Analisi del flusso',
    transport: 'Trasporto RTSP',
    preview: 'Anteprima riproducibile',
    record: 'Registrazione su disco',
    analysis: 'Fotogrammi per l analisi'
});

const COPYABLE = new Set(['h264', 'avc1', 'hevc', 'h265', 'mjpeg']);

export function stepsFor(camera) {
    return isLocalKind(camera.sourceKind) ? LOCAL_STEPS : NETWORK_STEPS;
}

export function stepLabel(step) {
    return STEP_LABELS[step] ?? step;
}

function result(status, detail, extra = {}) {
    return { status, detail, ...extra };
}

function candidateFormats(formats) {
    const preference = (entry) => {
        const [width, height] = entry.size.split('x').map((value) => Number.parseInt(value, 10));
        const pixels = width * height;
        const compressed = entry.format === 'mjpeg' || entry.format === 'h264' ? 2 : 1;
        return compressed * Math.min(pixels, 1920 * 1080);
    };

    return [...formats].sort((a, b) => preference(b) - preference(a)).slice(0, 8);
}

function withFormat(camera, candidate) {
    const [width, height] = candidate.size.split('x').map((value) => Number.parseInt(value, 10));
    return {
        ...camera,
        inputFormat: candidate.format,
        captureWidth: width,
        captureHeight: height,
        captureFps: candidate.fps ?? null
    };
}

function hostAndPort(url) {
    const parsed = (() => {
        try {
            return new URL(url);
        } catch {
            return null;
        }
    })();

    if (!parsed) return null;
    const fallback = parsed.protocol.startsWith('rtsp') ? 554 : (parsed.protocol === 'https:' ? 443 : 80);
    return { host: parsed.hostname, port: Number.parseInt(parsed.port, 10) || fallback };
}

function tcpReachable(host, port, timeoutMs = 4000) {
    return new Promise((resolve) => {
        const socket = connect({ host, port });
        const finish = (value) => {
            socket.removeAllListeners();
            socket.destroy();
            resolve(value);
        };
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));
    });
}

async function runPresence(camera) {
    const listing = await listLocalDevices({ withFormats: false });
    if (!listing.available) return result('fail', 'ffmpeg non disponibile: impossibile elencare le periferiche');

    const found = listing.devices.find((device) => device.id === camera.deviceId);
    if (!found) {
        return result('fail', `La periferica "${camera.deviceId}" non risulta collegata`, {
            options: listing.devices.map((device) => device.id)
        });
    }

    const busy = localCaptureState().find((entry) => entry.cameraId === camera.id);
    const detail = busy
        ? `${found.label} (${found.driver}), gia in uso dal sistema per: ${busy.roles.join(', ')}`
        : `${found.label} (${found.driver})`;

    return result('ok', detail);
}

async function runCapabilities(camera, state) {
    const listing = await listLocalDevices({ withFormats: true });
    const found = listing.devices.find((device) => device.id === camera.deviceId);
    const formats = found?.formats ?? [];

    if (formats.length === 0) {
        return result('warn', 'La periferica non dichiara i formati: si useranno i valori automatici', {
            state: { ...state, candidates: [] }
        });
    }

    const candidates = candidateFormats(formats);
    return result('ok', `${formats.length} combinazioni dichiarate, la migliore e ${candidates[0].format} ${candidates[0].size}`, {
        state: { ...state, candidates }
    });
}

async function runOpen(camera, state) {
    const trial = await trialFrames(camera, { seconds: 3 });
    if (trial.ok) {
        return result('ok', `${trial.frames} fotogrammi ricevuti con la configurazione attuale`, {
            state: { ...state, opened: true }
        });
    }

    const busy = localCaptureState().find((entry) => entry.cameraId === camera.id);
    const hint = busy
        ? `la periferica e occupata dal sistema stesso (${busy.roles.join(', ')})`
        : trial.error;

    return result('warn', `Nessun fotogramma: ${hint}`, { state: { ...state, opened: false } });
}

async function runFormat(camera, state) {
    if (state.opened === true) {
        return result('skip', 'La configurazione attuale funziona: nessun cambio necessario');
    }

    const candidates = state.candidates ?? [];
    if (candidates.length === 0) return result('fail', 'Nessun formato da provare');

    const attempted = [];
    for (const candidate of candidates) {
        const trial = await trialFrames(withFormat(camera, candidate), { seconds: 2 });
        attempted.push(`${candidate.format} ${candidate.size}${trial.ok ? ' OK' : ''}`);

        if (trial.ok) {
            const [width, height] = candidate.size.split('x').map((value) => Number.parseInt(value, 10));
            return result('ok', `Formato scelto: ${candidate.format} ${candidate.size}`, {
                patch: {
                    inputFormat: candidate.format,
                    captureWidth: width,
                    captureHeight: height,
                    captureFps: candidate.fps ?? null
                },
                state: { ...state, opened: true }
            });
        }
    }

    return result('fail', `Nessun formato ha prodotto fotogrammi. Provati: ${attempted.join(', ')}`);
}

async function runReachability(camera) {
    const target = hostAndPort(camera.mainStreamUrl ?? '');
    if (!target) return result('fail', 'URL del flusso non valido');

    const reachable = await tcpReachable(target.host, target.port);
    return reachable
        ? result('ok', `${target.host}:${target.port} risponde`)
        : result('fail', `${target.host}:${target.port} non risponde: verifica indirizzo, rete e firewall`);
}

async function runProbe(camera, state) {
    const outcome = await probeSource(camera, { preferSub: false })
        .then((value) => ({ value }))
        .catch((error) => ({ error }));

    if (outcome.error) {
        return result('warn', `Analisi non riuscita: ${outcome.error.message}`, { state: { ...state, probed: false } });
    }

    const video = outcome.value.video ?? {};
    return result('ok', `${video.codec ?? 'video'} ${video.width ?? '?'}x${video.height ?? '?'}`, {
        state: { ...state, probed: true, codec: video.codec ?? null }
    });
}

async function runTransport(camera, state) {
    if (state.probed === true) return result('skip', `Trasporto ${(camera.transport ?? 'tcp').toUpperCase()} funzionante`);
    if (!String(camera.mainStreamUrl ?? '').startsWith('rtsp')) return result('skip', 'Non applicabile fuori da RTSP');

    const alternative = camera.transport === 'udp' ? 'tcp' : 'udp';
    const outcome = await probeSource({ ...camera, transport: alternative }, { preferSub: false })
        .then((value) => ({ value }))
        .catch((error) => ({ error }));

    if (outcome.error) return result('fail', `Nessun trasporto funziona: ${outcome.error.message}`);

    return result('ok', `Il flusso risponde in ${alternative.toUpperCase()}`, {
        patch: { transport: alternative },
        state: { ...state, probed: true, codec: outcome.value.video?.codec ?? null }
    });
}

async function runPreview(camera, state) {
    const copyable = !isLocalKind(camera.sourceKind) && COPYABLE.has(String(state.codec ?? '').toLowerCase()) && state.codec !== 'mjpeg';
    const trial = await trialPreview(camera, { seconds: 3, copyable });

    if (!trial.ok) return result('fail', `Anteprima non prodotta: ${trial.error}`);

    return result('ok', trial.transcoded
        ? `Anteprima generata con transcodifica (${Math.round(trial.bytes / 1024)} kB in 3 s)`
        : `Anteprima generata senza ricodifica (${Math.round(trial.bytes / 1024)} kB in 3 s)`);
}

async function runRecord(camera, state) {
    const copyable = !isLocalKind(camera.sourceKind) && COPYABLE.has(String(state.codec ?? '').toLowerCase());
    const destination = join(tmpdir(), `argus-trial-${randomUUID()}.mp4`);
    const trial = await trialRecording(camera, destination, { seconds: 3, copyable });

    const size = (() => {
        try {
            return statSync(destination).size;
        } catch {
            return 0;
        }
    })();

    rmSync(destination, { force: true });

    if (size < 4096) {
        return result('fail', `Nessun segmento valido (${size} byte). ${trial.stderr ?? ''}`.trim());
    }

    return result('ok', trial.encoded
        ? `Segmento scritto con codifica H.264 (${Math.round(size / 1024)} kB in 3 s)`
        : `Segmento scritto senza ricodifica (${Math.round(size / 1024)} kB in 3 s)`);
}

async function runAnalysis(camera) {
    const trial = await trialVisionFrames(camera, { seconds: 3 });
    return trial.ok
        ? result('ok', `${trial.frames} fotogrammi 640x360 disponibili per il riconoscimento`)
        : result('warn', `Analisi non alimentata: ${trial.error}`);
}

const RUNNERS = Object.freeze({
    presence: runPresence,
    capabilities: runCapabilities,
    open: runOpen,
    format: runFormat,
    reachability: runReachability,
    probe: runProbe,
    transport: runTransport,
    preview: runPreview,
    record: runRecord,
    analysis: runAnalysis
});

export async function runAutoconfigureStep({ camera, step, state = {} }) {
    const runner = RUNNERS[step];
    if (!runner) throw new Error(`Passo sconosciuto: ${step}`);

    const merged = { ...camera, ...(state.patch ?? {}) };
    const outcome = await runner(merged, state);

    const steps = stepsFor(camera);
    const index = steps.indexOf(step);

    return {
        step,
        label: stepLabel(step),
        status: outcome.status,
        detail: outcome.detail,
        options: outcome.options ?? null,
        state: {
            ...(outcome.state ?? state),
            patch: { ...(state.patch ?? {}), ...(outcome.patch ?? {}) }
        },
        next: index >= 0 && index + 1 < steps.length ? steps[index + 1] : null
    };
}
