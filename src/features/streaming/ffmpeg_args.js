import { buildCaptureArgs } from '../cameras/camera_input.js';
import { pickEncoder, encoderArgs } from './encoder.js';

const COPYABLE_VIDEO = new Set(['h264', 'avc1']);

export function buildInputArgs(input) {
    return buildCaptureArgs(input);
}

export function buildPreviewArgs(input, probe, tools = {}, options = {}) {
    const accelerators = Array.isArray(tools) ? tools : (tools.accelerators ?? []);
    const usableEncoders = Array.isArray(tools) ? null : (tools.encoders ?? null);
    const args = buildInputArgs(input);
    const canCopy = probe && COPYABLE_VIDEO.has(String(probe.codec ?? '').toLowerCase());

    const hwaccel = options.hwaccelBackend ?? 'auto';
    if (hwaccel !== 'none') {
        const targetAccel = hwaccel !== 'auto' && accelerators.includes(hwaccel)
            ? hwaccel
            : accelerators.find((a) => ['cuda', 'qsv', 'd3d11va', 'vaapi', 'videotoolbox'].includes(a));
        if (targetAccel) {
            args.splice(args.indexOf('-i'), 0, '-hwaccel', targetAccel);
        }
    }

    if (options.cpuThreads) {
        args.splice(args.indexOf('-i'), 0, '-threads', String(options.cpuThreads));
    }

    args.push('-an', '-map', '0:v:0');

    if (canCopy) {
        args.push('-c:v', 'copy');
    } else {
        args.push(...encoderArgs(pickEncoder(accelerators, options.videoEncoder ?? 'auto', usableEncoders), {
            gop: 50,
            bitrate: '2500k',
            maxrate: '3000k',
            bufsize: '4000k',
            maxHeight: 720,
            sourceHeight: probe?.height ?? null
        }));
    }

    args.push('-f', 'mp4');
    args.push('-movflags', 'frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset');
    args.push('-frag_duration', '500000');
    args.push('pipe:1');

    return { args, transcoded: !canCopy, accelerators };
}


export function buildRecordArgs(input, options) {
    const args = buildInputArgs(input);

    args.push('-map', '0:v:0');
    if (options.withAudio) args.push('-map', '0:a:0?');
    args.push('-c', 'copy');
    args.push('-f', 'segment');
    args.push('-segment_time', String(options.segmentSeconds));
    args.push('-segment_format', 'mp4');
    args.push('-segment_format_options', 'movflags=+faststart');
    args.push('-segment_list', options.listingPath);
    args.push('-segment_list_type', 'csv');
    args.push('-segment_list_flags', '+live');
    args.push('-segment_list_size', '0');
    args.push('-reset_timestamps', '1');
    args.push('-strftime', '1');
    args.push('-segment_atclocktime', '1');
    args.push(options.pattern);

    return args;
}

export function buildThumbnailArgs(input, destination) {
    const args = buildInputArgs(input);
    args.push('-frames:v', '1', '-q:v', '4', '-y', destination);
    return args;
}

export function buildMotionArgs(input, accelerators = [], options = {}) {
    const args = buildInputArgs(input);
    const hwaccel = options.hwaccelBackend ?? 'auto';
    if (hwaccel !== 'none') {
        const targetAccel = hwaccel !== 'auto' && accelerators.includes(hwaccel)
            ? hwaccel
            : accelerators.find((a) => ['cuda', 'qsv', 'd3d11va', 'vaapi', 'videotoolbox'].includes(a));
        if (targetAccel) {
            args.splice(args.indexOf('-i'), 0, '-hwaccel', targetAccel);
        }
    }
    args.push('-an', '-vf', 'fps=5,scale=160:90,format=gray', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1');
    return args;
}


