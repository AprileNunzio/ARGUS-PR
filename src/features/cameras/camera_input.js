import { validationError } from '../../kernel/errors.js';
import { redactCredentials } from '../../security/guards.js';
import { authenticatedStreamUrl } from './camera_url.js';

export const SOURCE_KINDS = Object.freeze(['rtsp', 'http', 'mjpeg', 'usb']);
export const LOCAL_SOURCE_KINDS = Object.freeze(['usb']);
export const INPUT_FORMATS = Object.freeze(['auto', 'mjpeg', 'h264', 'yuyv422', 'uyvy422', 'nv12', 'yuv420p', 'rgb24', 'bgr24', 'gray']);

const BASE_ARGS = Object.freeze(['-hide_banner', '-loglevel', 'error']);
const LOW_LATENCY_ARGS = Object.freeze(['-fflags', 'nobuffer', '-flags', 'low_delay']);
const DEVICE_PATTERN = /^[A-Za-z0-9/][A-Za-z0-9 ._:@#()\/-]{0,199}$/;
const CAPTURE_BUFFER = '256M';
const THREAD_QUEUE = '1024';
const RAW_FORMATS = Object.freeze(['yuyv422', 'uyvy422', 'nv12', 'yuv420p', 'rgb24', 'bgr24', 'gray']);

export function isLocalKind(kind) {
    return LOCAL_SOURCE_KINDS.includes(kind);
}

export function requireDeviceId(value, field = 'Device') {
    if (typeof value !== 'string') throw validationError(`${field} must be text`);
    const candidate = value.trim();
    if (candidate.length === 0) throw validationError(`${field} is required`);
    if (!DEVICE_PATTERN.test(candidate)) throw validationError(`${field} contains unsupported characters`);
    return candidate;
}

function captureSize(camera) {
    const width = Number.parseInt(camera.captureWidth, 10);
    const height = Number.parseInt(camera.captureHeight, 10);
    if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
    if (width < 16 || height < 16 || width > 7680 || height > 4320) return null;
    return `${width}x${height}`;
}

function captureRate(camera) {
    const fps = Number.parseInt(camera.captureFps, 10);
    if (!Number.isInteger(fps) || fps < 1 || fps > 240) return null;
    return String(fps);
}

function pixelFormat(camera) {
    const format = camera.inputFormat;
    if (typeof format !== 'string' || format === 'auto' || format.length === 0) return null;
    if (!INPUT_FORMATS.includes(format)) throw validationError('Input format is not supported');
    return format;
}

function windowsArgs(device, size, rate, format) {
    const args = ['-f', 'dshow', '-rtbufsize', CAPTURE_BUFFER, '-thread_queue_size', THREAD_QUEUE];
    if (format && RAW_FORMATS.includes(format)) args.push('-pixel_format', format);
    if (format && !RAW_FORMATS.includes(format)) args.push('-vcodec', format);
    if (size) args.push('-video_size', size);
    if (rate) args.push('-framerate', rate);
    return { args, target: `video=${device}` };
}

function linuxArgs(device, size, rate, format) {
    const args = ['-f', 'v4l2', '-thread_queue_size', THREAD_QUEUE];
    if (format) args.push('-input_format', format);
    if (size) args.push('-video_size', size);
    if (rate) args.push('-framerate', rate);
    return { args, target: device };
}

function darwinArgs(device, size, rate) {
    const args = ['-f', 'avfoundation', '-thread_queue_size', THREAD_QUEUE];
    if (rate) args.push('-framerate', rate);
    if (size) args.push('-video_size', size);
    return { args, target: device };
}

function localInput(camera, platform) {
    const device = requireDeviceId(camera.deviceId, 'Capture device');
    const size = captureSize(camera);
    const rate = captureRate(camera);
    const format = pixelFormat(camera);

    if (platform === 'win32') return windowsArgs(device, size, rate, format);
    if (platform === 'darwin') return darwinArgs(device, size, rate);
    return linuxArgs(device, size, rate, format);
}

function networkInput(camera, options) {
    const source = options.preferSub === true
        ? (camera.subStreamUrl ?? camera.mainStreamUrl)
        : (camera.mainStreamUrl ?? camera.subStreamUrl);

    const target = authenticatedStreamUrl(source, camera.username, camera.password);
    const args = [];

    if (target.startsWith('rtsp')) {
        args.push('-rtsp_transport', camera.transport === 'udp' ? 'udp' : 'tcp');
        args.push('-stimeout', '8000000');
    } else {
        args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
    }

    return { args, target };
}

export function resolveInput(camera, options = {}) {
    if (!camera) throw validationError('Camera is missing');
    const platform = options.platform ?? process.platform;
    const kind = camera.sourceKind ?? 'rtsp';

    if (!SOURCE_KINDS.includes(kind)) throw validationError('Source kind is not supported');

    const resolved = isLocalKind(kind)
        ? localInput(camera, platform)
        : networkInput(camera, options);

    return {
        kind,
        local: isLocalKind(kind),
        target: resolved.target,
        demuxArgs: resolved.args,
        label: isLocalKind(kind) ? resolved.target : redactCredentials(resolved.target)
    };
}

export function buildCaptureArgs(input, options = {}) {
    const args = [...BASE_ARGS, '-nostdin', ...input.demuxArgs];
    if (options.lowLatency !== false && !input.local) args.push(...LOW_LATENCY_ARGS);
    args.push('-i', input.target);
    return args;
}

export function buildProbeArgs(input, extra = []) {
    return [...BASE_ARGS, ...input.demuxArgs, ...extra, input.target];
}
