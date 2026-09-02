import { execFile } from 'node:child_process';
import { getCameraSecrets } from './camera_repository.js';
import { getMediaTools } from '../../platform/media_tools.js';
import { notFound, AppError, ErrorCode } from '../../kernel/errors.js';
import { redactCredentials } from '../../security/guards.js';
import { createLogger } from '../../kernel/logger.js';

const log = createLogger('probe');
const PROBE_TIMEOUT_MS = 15000;

function buildAuthenticatedUrl(rawUrl, username, password) {
    if (!username) return rawUrl;
    const parsed = new URL(rawUrl);
    parsed.username = encodeURIComponent(username);
    if (password) parsed.password = encodeURIComponent(password);
    return parsed.toString();
}

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

export async function probeStream(cameraId) {
    const camera = getCameraSecrets(cameraId);
    if (!camera) throw notFound('Camera');

    const tools = getMediaTools();
    const target = buildAuthenticatedUrl(camera.mainStreamUrl, camera.username, camera.password);

    const args = [
        '-hide_banner',
        '-loglevel', 'error',
        '-rtsp_transport', camera.transport === 'udp' ? 'udp' : 'tcp',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        '-analyzeduration', '3000000',
        '-probesize', '2000000',
        target
    ];

    const outcome = await runFfprobe(tools.ffprobe.path, args);

    if (outcome.error) {
        log.warn('probe failed', {
            camera: cameraId,
            url: redactCredentials(camera.mainStreamUrl),
            detail: outcome.stderr?.slice(0, 300) ?? outcome.error.message
        });
        throw new AppError(ErrorCode.MEDIA, 'Stream unreachable or rejected the credentials', {
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

    if (!parsed) {
        throw new AppError(ErrorCode.MEDIA, 'Stream responded with unreadable metadata');
    }

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
