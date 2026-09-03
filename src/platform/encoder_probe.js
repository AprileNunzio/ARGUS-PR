import { execFile } from 'node:child_process';
import { createLogger } from '../kernel/logger.js';

const log = createLogger('encoders');

const PROBE_TIMEOUT_MS = 12000;
const SOFTWARE_ENCODER = 'libx264';

export const ACCELERATOR_ENCODERS = Object.freeze({
    cuda: 'h264_nvenc',
    qsv: 'h264_qsv',
    amf: 'h264_amf',
    vaapi: 'h264_vaapi',
    videotoolbox: 'h264_videotoolbox'
});

export function candidateEncoders(accelerators = []) {
    const candidates = [];
    for (const [accelerator, encoder] of Object.entries(ACCELERATOR_ENCODERS)) {
        if (accelerators.includes(accelerator)) candidates.push(encoder);
    }
    candidates.push(SOFTWARE_ENCODER);
    return candidates;
}

function probeArgs(encoder) {
    const args = [
        '-hide_banner',
        '-loglevel', 'error',
        '-nostdin',
        '-f', 'lavfi',
        '-i', 'color=black:s=320x240:d=0.2',
        '-c:v', encoder
    ];

    if (encoder === 'h264_vaapi') args.push('-vf', 'format=nv12,hwupload');
    args.push('-f', 'null', '-');

    return args;
}

function runProbe(ffmpegPath, encoder) {
    return new Promise((resolve) => {
        execFile(ffmpegPath, probeArgs(encoder), {
            timeout: PROBE_TIMEOUT_MS,
            windowsHide: true,
            maxBuffer: 1024 * 128,
            shell: false
        }, (error, stdout, stderr) => {
            const text = String(stderr ?? '');
            const failed = Boolean(error) || /Error while opening encoder|Unknown encoder|not support|No such|Cannot load|Function not implemented/i.test(text);
            resolve({ encoder, usable: !failed, detail: failed ? text.split(/\r?\n/)[0]?.slice(0, 160) ?? null : null });
        });
    });
}

export async function detectUsableEncoders(ffmpegPath, accelerators = []) {
    const results = [];

    for (const encoder of candidateEncoders(accelerators)) {
        const outcome = await runProbe(ffmpegPath, encoder);
        results.push(outcome);
        if (!outcome.usable) log.warn('encoder rejected', { encoder, detail: outcome.detail });
    }

    const usable = results.filter((entry) => entry.usable).map((entry) => entry.encoder);
    if (usable.length === 0) usable.push(SOFTWARE_ENCODER);

    log.info('encoders verified', { usable });
    return usable;
}
