import { spawn } from 'node:child_process';
import { createLogger } from '../../kernel/logger.js';
import { getMediaTools } from '../../platform/media_tools.js';
import { getCamera, getCameraSecrets } from '../cameras/camera_repository.js';
import { createRtspSession, createRtpPacker, interleave } from './rtsp_backchannel.js';

const log = createLogger('talkback');

const FRAME_MS = 20;
const SAMPLE_RATE = 8000;
const FRAME_BYTES = (SAMPLE_RATE / 1000) * FRAME_MS;
const PROBE_TTL_MS = 5 * 60 * 1000;
const MAX_CLIP_MS = 120000;

const probes = new Map();
const sessions = new Map();

function streamUrlFor(cameraId) {
    const camera = getCamera(cameraId);
    if (!camera) throw new Error('Telecamera sconosciuta');

    const secrets = getCameraSecrets(cameraId);
    const url = secrets?.mainStreamUrl ?? secrets?.subStreamUrl;
    if (!url) throw new Error('La telecamera non ha un flusso RTSP configurato');

    return { camera, url, username: camera.username ?? '', password: secrets?.password ?? '' };
}

async function probeCamera(cameraId) {
    const { url, username, password } = streamUrlFor(cameraId);
    const session = createRtspSession({ url, username, password });

    try {
        await session.connect();
        const backchannel = await session.describe();
        return {
            supported: true,
            codec: backchannel.codec.name,
            payloadType: backchannel.codec.payload,
            declared: backchannel.tagged
        };
    } finally {
        session.close();
    }
}

export async function talkbackStatus(cameraId, { refresh = false } = {}) {
    const cached = probes.get(cameraId);
    if (!refresh && cached && Date.now() - cached.at < PROBE_TTL_MS) return cached.value;

    const value = await probeCamera(cameraId).catch((error) => ({ supported: false, reason: error.message }));
    probes.set(cameraId, { at: Date.now(), value });
    return value;
}

export function forgetTalkback(cameraId) {
    probes.delete(cameraId);
}

export function talkbackActive(cameraId) {
    return sessions.has(cameraId);
}

export function listTalkbacks() {
    return [...sessions.entries()].map(([cameraId, entry]) => ({
        cameraId,
        since: entry.since,
        source: entry.source
    }));
}

function codecArgs(codecName) {
    return codecName === 'PCMA'
        ? ['-f', 'alaw', '-acodec', 'pcm_alaw']
        : ['-f', 'mulaw', '-acodec', 'pcm_mulaw'];
}

export async function openTalkback(cameraId, { source = 'operatore' } = {}) {
    if (sessions.has(cameraId)) throw new Error('Un canale audio verso questa telecamera e gia aperto');

    const status = await talkbackStatus(cameraId);
    if (!status.supported) throw new Error(status.reason ?? 'canale audio non disponibile');

    const { url, username, password } = streamUrlFor(cameraId);
    const session = createRtspSession({ url, username, password });

    await session.connect();
    const backchannel = await session.describe();
    await session.setup(backchannel.url);
    await session.record();

    const pack = createRtpPacker({ payloadType: backchannel.codec.payload });
    const entry = { session, pack, codec: backchannel.codec, since: Date.now(), source, pending: Buffer.alloc(0) };
    sessions.set(cameraId, entry);

    return { cameraId, codec: backchannel.codec.name, since: entry.since };
}

export function pushTalkbackAudio(cameraId, chunk) {
    const entry = sessions.get(cameraId);
    if (!entry) throw new Error('nessun canale audio aperto');

    entry.pending = Buffer.concat([entry.pending, chunk]);
    let sent = 0;

    while (entry.pending.length >= FRAME_BYTES) {
        const frame = entry.pending.subarray(0, FRAME_BYTES);
        entry.pending = entry.pending.subarray(FRAME_BYTES);
        entry.session.write(interleave(0, entry.pack(frame)));
        sent += 1;
    }

    return sent;
}

export async function closeTalkback(cameraId) {
    const entry = sessions.get(cameraId);
    if (!entry) return { cameraId, active: false };

    sessions.delete(cameraId);
    await entry.session.teardown().catch(() => null);

    return { cameraId, active: false, durationMs: Date.now() - entry.since };
}

function transcode(filePath, codecName) {
    const tools = getMediaTools();
    if (!tools?.ffmpeg?.path) throw new Error('ffmpeg non disponibile');

    return spawn(tools.ffmpeg.path, [
        '-hide_banner',
        '-loglevel', 'error',
        '-i', filePath,
        '-vn',
        '-ar', String(SAMPLE_RATE),
        '-ac', '1',
        ...codecArgs(codecName),
        '-'
    ], { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
}

export async function playClip(cameraId, filePath, { source = 'clip' } = {}) {
    const opened = await openTalkback(cameraId, { source });
    const entry = sessions.get(cameraId);
    const child = transcode(filePath, entry.codec.name);

    let stderr = '';
    child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
    });

    const queue = [];
    child.stdout.on('data', (chunk) => queue.push(chunk));

    const finished = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(stderr.trim().slice(0, 200) || `ffmpeg uscito con codice ${code}`));
        });
    });

    await finished.catch(async (error) => {
        await closeTalkback(cameraId);
        throw error;
    });

    const samples = Buffer.concat(queue);
    const frames = Math.floor(samples.length / FRAME_BYTES);

    if (frames * FRAME_MS > MAX_CLIP_MS) {
        await closeTalkback(cameraId);
        throw new Error('la clip supera i due minuti consentiti');
    }

    for (let index = 0; index < frames; index += 1) {
        const offset = index * FRAME_BYTES;
        entry.session.write(interleave(0, entry.pack(samples.subarray(offset, offset + FRAME_BYTES))));
        await new Promise((resolve) => setTimeout(resolve, FRAME_MS));
    }

    await closeTalkback(cameraId);
    log.info('clip inviata alla telecamera', { cameraId, frames });

    return { ...opened, frames, durationMs: frames * FRAME_MS };
}
