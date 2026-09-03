import { execFile } from 'node:child_process';
import { getCameraSecrets } from './camera_repository.js';
import { resolveInput, buildProbeArgs } from './camera_input.js';
import { getMediaTools } from '../../platform/media_tools.js';
import { notFound, AppError, ErrorCode } from '../../kernel/errors.js';
import { createLogger } from '../../kernel/logger.js';

const log = createLogger('probe');
const PROBE_TIMEOUT_MS = 15000;

const REPORT_ARGS = Object.freeze([
    '-print_format', 'json',
    '-show_streams',
    '-show_format',
    '-analyzeduration', '3000000',
    '-probesize', '2000000'
]);

function runFfprobe(binary, args) {
    return new Promise((resolve) => {
        execFile(binary, args, {
            timeout: PROBE_TIMEOUT_MS,
            windowsHide: true,
            maxBuffer: 1024 * 512,
            shell: false
        }, (error, stdout, stderr) => {
            resolve({ error, stdout, stderr });
        });
    });
}

function summarise(parsed) {
    const video = (parsed.streams ?? []).find((stream) => stream.codec_type === 'video') ?? null;
    const audio = (parsed.streams ?? []).find((stream) => stream.codec_type === 'audio') ?? null;

    return {
        reachable: true,
        video: video && {
            codec: video.codec_name,
            width: video.width,
            height: video.height,
            frameRate: video.avg_frame_rate,
            pixelFormat: video.pix_fmt
        },
        audio: audio && {
            codec: audio.codec_name,
            channels: audio.channels,
            sampleRate: audio.sample_rate
        },
        container: parsed.format?.format_name ?? null
    };
}

export async function probeSource(camera, options = {}) {
    const input = resolveInput(camera, { preferSub: options.preferSub === true });
    const tools = getMediaTools();
    const outcome = await runFfprobe(tools.ffprobe.path, buildProbeArgs(input, REPORT_ARGS));

    if (outcome.error) {
        log.warn('probe failed', {
            camera: camera.id ?? null,
            source: input.label,
            detail: outcome.stderr?.slice(0, 300) ?? outcome.error.message
        });
        throw new AppError(ErrorCode.MEDIA, 'Stream unreachable or credentials rejected', {
            details: { hint: outcome.stderr?.slice(0, 200) ?? null }
        });
    }

    const parsed = (() => {
        try {
            return JSON.parse(outcome.stdout);
        } catch {
            return null;
        }
    })();

    if (!parsed) throw new AppError(ErrorCode.MEDIA, 'Stream returned unreadable metadata');

    return summarise(parsed);
}

export async function probeStream(cameraId, options = {}) {
    const camera = getCameraSecrets(cameraId);
    if (!camera) throw notFound('Camera');
    return probeSource(camera, options);
}
