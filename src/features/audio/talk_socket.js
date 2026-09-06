import { createLogger } from '../../kernel/logger.js';
import { can, Permission } from '../../security/rbac.js';
import { openTalkback, pushTalkbackAudio, closeTalkback } from './talkback_service.js';

const log = createLogger('talk-socket');

const TALK_PREFIX = '/api/audio/talk/';
const MAX_CHUNK_BYTES = 16384;
const IDLE_TIMEOUT_MS = 60000;
const BIAS = 0x84;
const CLIP = 32635;

const EXPONENTS = Uint8Array.from([
    0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3,
    4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
    5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
    5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
    6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
    6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
    6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
    6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7
]);

export function encodeMuLawSample(value) {
    let sample = Math.max(-CLIP, Math.min(CLIP, value));
    const sign = sample < 0 ? 0x80 : 0;
    if (sign !== 0) sample = -sample;

    sample += BIAS;
    const exponent = EXPONENTS[(sample >> 7) & 0xff];
    const mantissa = (sample >> (exponent + 3)) & 0x0f;

    return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}

export function encodeMuLaw(pcm) {
    const samples = Math.floor(pcm.length / 2);
    const out = Buffer.alloc(samples);

    for (let index = 0; index < samples; index += 1) {
        out[index] = encodeMuLawSample(pcm.readInt16LE(index * 2));
    }

    return out;
}

export function isTalkPath(pathname) {
    return typeof pathname === 'string' && pathname.startsWith(TALK_PREFIX) && pathname.length > TALK_PREFIX.length;
}

export function cameraIdFromTalkPath(pathname) {
    return decodeURIComponent(pathname.slice(TALK_PREFIX.length).split('/')[0]);
}

export function authoriseTalk(actor) {
    return Boolean(actor) && can(actor.role, Permission.ALARM_ACKNOWLEDGE);
}

export async function attachTalkSession(ws, actor, cameraId) {
    const opened = await openTalkback(cameraId, { source: `microfono:${actor.username}` })
        .catch((error) => ({ failure: error.message }));

    if (opened.failure) {
        ws.send(JSON.stringify({ type: 'error', message: opened.failure }));
        ws.close(1011, 'talkback non disponibile');
        return;
    }

    log.info('microfono aperto', { cameraId, user: actor.username, codec: opened.codec });
    ws.send(JSON.stringify({ type: 'ready', codec: opened.codec, sampleRate: 8000, frameMs: 20 }));

    let idle = setTimeout(() => ws.close(1000, 'inattivo'), IDLE_TIMEOUT_MS);

    const finish = async (reason) => {
        clearTimeout(idle);
        await closeTalkback(cameraId).catch(() => null);
        log.info('microfono chiuso', { cameraId, user: actor.username, reason });
    };

    ws.on('message', (data, isBinary) => {
        if (!isBinary) return;
        if (data.length === 0 || data.length > MAX_CHUNK_BYTES) return;

        clearTimeout(idle);
        idle = setTimeout(() => ws.close(1000, 'inattivo'), IDLE_TIMEOUT_MS);

        try {
            pushTalkbackAudio(cameraId, encodeMuLaw(Buffer.from(data)));
        } catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
            ws.close(1011, 'canale interrotto');
        }
    });

    ws.on('close', () => finish('chiusura'));
    ws.on('error', () => finish('errore'));
}
