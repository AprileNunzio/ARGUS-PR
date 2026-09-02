const COPYABLE_VIDEO = new Set(['h264', 'avc1']);

export function buildInputArgs(camera) {
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];

    if (camera.url.startsWith('rtsp')) {
        args.push('-rtsp_transport', camera.transport === 'udp' ? 'udp' : 'tcp');
        args.push('-stimeout', '8000000');
    }

    args.push('-fflags', 'nobuffer', '-flags', 'low_delay');
    args.push('-i', camera.url);

    return args;
}

export function buildPreviewArgs(camera, probe, accelerators = []) {
    const args = buildInputArgs(camera);
    const canCopy = probe && COPYABLE_VIDEO.has(String(probe.codec ?? '').toLowerCase());

    args.push('-an', '-map', '0:v:0');

    if (canCopy) {
        args.push('-c:v', 'copy');
    } else {
        args.push('-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency');
        args.push('-profile:v', 'main', '-pix_fmt', 'yuv420p');
        args.push('-g', '50', '-sc_threshold', '0');
        if (probe?.height && probe.height > 720) args.push('-vf', 'scale=-2:720');
        args.push('-b:v', '2500k', '-maxrate', '3000k', '-bufsize', '4000k');
    }

    args.push('-f', 'mp4');
    args.push('-movflags', 'frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset');
    args.push('-frag_duration', '500000');
    args.push('pipe:1');

    return { args, transcoded: !canCopy, accelerators };
}

export function buildRecordArgs(camera, segmentPattern, segmentSeconds) {
    const args = buildInputArgs(camera);

    args.push('-map', '0');
    args.push('-c', 'copy');
    args.push('-f', 'segment');
    args.push('-segment_time', String(segmentSeconds));
    args.push('-segment_format', 'mp4');
    args.push('-segment_format_options', 'movflags=+faststart');
    args.push('-reset_timestamps', '1');
    args.push('-strftime', '1');
    args.push('-segment_atclocktime', '1');
    args.push(segmentPattern);

    return args;
}

export function buildThumbnailArgs(camera, destination) {
    const args = buildInputArgs(camera);
    args.push('-frames:v', '1', '-q:v', '4', '-y', destination);
    return args;
}
