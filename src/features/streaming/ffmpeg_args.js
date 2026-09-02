const COPYABLE_VIDEO = new Set(['h264', 'avc1']);

export function buildInputArgs(camera) {
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];

    if (camera.url.startsWith('rtsp')) {
        args.push('-rtsp_transport', camera.transport === 'udp' ? 'udp' : 'tcp');
        args.push('-stimeout', '8000000');
    } else {
        args.push('-re');
    }

    args.push('-fflags', 'nobuffer', '-flags', 'low_delay');
    args.push('-i', camera.url);

    return args;
}

export function buildPreviewArgs(camera, probe, accelerators = [], options = {}) {
    const args = buildInputArgs(camera);
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
        const preferredEncoder = options.videoEncoder && options.videoEncoder !== 'auto'
            ? options.videoEncoder
            : (accelerators.includes('cuda') ? 'h264_nvenc'
                : accelerators.includes('qsv') ? 'h264_qsv'
                : accelerators.includes('amf') ? 'h264_amf'
                : accelerators.includes('vaapi') ? 'h264_vaapi'
                : accelerators.includes('videotoolbox') ? 'h264_videotoolbox'
                : 'libx264');

        if (preferredEncoder === 'h264_nvenc') {
            args.push('-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'll', '-profile:v', 'main');
        } else if (preferredEncoder === 'h264_qsv') {
            args.push('-c:v', 'h264_qsv', '-preset', 'veryfast');
        } else if (preferredEncoder === 'h264_amf') {
            args.push('-c:v', 'h264_amf', '-usage', 'lowlatency');
        } else if (preferredEncoder === 'h264_vaapi') {
            args.push('-c:v', 'h264_vaapi');
        } else if (preferredEncoder === 'h264_videotoolbox') {
            args.push('-c:v', 'h264_videotoolbox', '-realtime', '1');
        } else {
            args.push('-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'main');
        }

        args.push('-pix_fmt', 'yuv420p', '-g', '50');
        if (probe?.height && probe.height > 720) args.push('-vf', 'scale=-2:720');
        args.push('-b:v', '2500k', '-maxrate', '3000k', '-bufsize', '4000k');
    }

    args.push('-f', 'mp4');
    args.push('-movflags', 'frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset');
    args.push('-frag_duration', '500000');
    args.push('pipe:1');

    return { args, transcoded: !canCopy, accelerators };
}


export function buildRecordArgs(camera, options) {
    const args = buildInputArgs(camera);

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

export function buildThumbnailArgs(camera, destination) {
    const args = buildInputArgs(camera);
    args.push('-frames:v', '1', '-q:v', '4', '-y', destination);
    return args;
}

export function buildMotionArgs(camera, accelerators = [], options = {}) {
    const args = buildInputArgs(camera);
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


