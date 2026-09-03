import { spawn } from 'node:child_process';
import { getMediaTools } from '../../platform/media_tools.js';
import { resolveInput, buildCaptureArgs } from './camera_input.js';
import { pickEncoder, encoderArgs } from '../streaming/encoder.js';

const GRAY_FRAME_BYTES = 160 * 90;
const BGR_FRAME_BYTES = 640 * 360 * 3;

function runCapture(args, timeoutMs) {
    const tools = getMediaTools();

    return new Promise((resolve) => {
        const child = spawn(tools.ffmpeg.path, args, {
            windowsHide: true,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let bytes = 0;
        let stderr = '';
        let settled = false;

        const finish = (outcome) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { child.kill('SIGKILL'); } catch { /* gia terminato */ }
            resolve(outcome);
        };

        const timer = setTimeout(() => finish({ bytes, stderr, timedOut: true }), timeoutMs);

        child.stdout.on('data', (chunk) => { bytes += chunk.length; });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
        child.on('error', (error) => finish({ bytes, stderr: error.message, timedOut: false }));
        child.on('close', () => finish({ bytes, stderr, timedOut: false }));
    });
}

function firstError(stderr) {
    const line = stderr.split(/\r?\n/).map((entry) => entry.trim()).find((entry) => entry.length > 0);
    return line ? line.replace(/^\[[^\]]+\]\s*/, '').slice(0, 200) : null;
}

export async function trialFrames(camera, options = {}) {
    const seconds = options.seconds ?? 3;
    const input = resolveInput(camera, { preferSub: options.preferSub === true });
    const args = buildCaptureArgs(input);

    args.push('-an', '-t', String(seconds));
    args.push('-vf', 'fps=5,scale=160:90,format=gray', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1');

    const outcome = await runCapture(args, (seconds + 8) * 1000);
    const frames = Math.floor(outcome.bytes / GRAY_FRAME_BYTES);

    return {
        ok: frames > 0,
        frames,
        error: frames > 0 ? null : firstError(outcome.stderr) ?? 'nessun fotogramma ricevuto'
    };
}

export async function trialVisionFrames(camera, options = {}) {
    const seconds = options.seconds ?? 3;
    const input = resolveInput(camera, { preferSub: true });
    const args = buildCaptureArgs(input);

    args.push('-an', '-t', String(seconds));
    args.push('-vf', 'fps=5,scale=640:360', '-f', 'rawvideo', '-pix_fmt', 'bgr24', 'pipe:1');

    const outcome = await runCapture(args, (seconds + 8) * 1000);
    const frames = Math.floor(outcome.bytes / BGR_FRAME_BYTES);

    return {
        ok: frames > 0,
        frames,
        error: frames > 0 ? null : firstError(outcome.stderr) ?? 'nessun fotogramma ricevuto'
    };
}

export async function trialPreview(camera, options = {}) {
    const seconds = options.seconds ?? 3;
    const tools = getMediaTools();
    const input = resolveInput(camera, { preferSub: true });
    const args = buildCaptureArgs(input);
    const copyable = options.copyable === true;

    args.push('-an', '-map', '0:v:0', '-t', String(seconds));

    if (copyable) args.push('-c:v', 'copy');
    else args.push(...encoderArgs(pickEncoder(tools.accelerators, 'auto'), { gop: 50, bitrate: '2000k' }));

    args.push('-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset');
    args.push('-frag_duration', '500000', 'pipe:1');

    const outcome = await runCapture(args, (seconds + 12) * 1000);

    return {
        ok: outcome.bytes > 2048,
        bytes: outcome.bytes,
        transcoded: !copyable,
        error: outcome.bytes > 2048 ? null : firstError(outcome.stderr) ?? 'nessun frammento prodotto'
    };
}

export async function trialRecording(camera, destination, options = {}) {
    const seconds = options.seconds ?? 3;
    const tools = getMediaTools();
    const input = resolveInput(camera, { preferSub: false });
    const args = buildCaptureArgs(input);
    const copyable = options.copyable === true;

    args.push('-map', '0:v:0', '-an', '-t', String(seconds));

    if (copyable) args.push('-c', 'copy');
    else args.push(...encoderArgs(pickEncoder(tools.accelerators, 'auto'), { gop: 50, preset: 'veryfast' }));

    args.push('-f', 'mp4', '-movflags', '+faststart', '-y', destination);

    const outcome = await runCapture(args, (seconds + 12) * 1000);

    return {
        stderr: firstError(outcome.stderr),
        encoded: !copyable
    };
}
