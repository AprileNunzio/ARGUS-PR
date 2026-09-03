const GPU_ENCODERS = Object.freeze({
    cuda: 'h264_nvenc',
    qsv: 'h264_qsv',
    amf: 'h264_amf',
    vaapi: 'h264_vaapi',
    videotoolbox: 'h264_videotoolbox'
});

const DECODE_ACCELERATORS = Object.freeze(['cuda', 'qsv', 'd3d11va', 'vaapi', 'videotoolbox']);

export function pickAccelerator(accelerators = [], preference = 'auto') {
    if (preference === 'none') return null;
    if (preference !== 'auto' && accelerators.includes(preference)) return preference;
    return accelerators.find((entry) => DECODE_ACCELERATORS.includes(entry)) ?? null;
}

export function pickEncoder(accelerators = [], preference = 'auto') {
    if (preference && preference !== 'auto') return preference;
    for (const [accelerator, encoder] of Object.entries(GPU_ENCODERS)) {
        if (accelerators.includes(accelerator)) return encoder;
    }
    return 'libx264';
}

export function encoderArgs(encoder, options = {}) {
    const args = [];

    if (encoder === 'h264_nvenc') args.push('-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'll', '-profile:v', 'main');
    else if (encoder === 'h264_qsv') args.push('-c:v', 'h264_qsv', '-preset', 'veryfast');
    else if (encoder === 'h264_amf') args.push('-c:v', 'h264_amf', '-usage', 'lowlatency');
    else if (encoder === 'h264_vaapi') args.push('-c:v', 'h264_vaapi');
    else if (encoder === 'h264_videotoolbox') args.push('-c:v', 'h264_videotoolbox', '-realtime', '1');
    else args.push('-c:v', 'libx264', '-preset', options.preset ?? 'veryfast', '-tune', options.tune ?? 'zerolatency', '-profile:v', 'main');

    args.push('-pix_fmt', 'yuv420p', '-g', String(options.gop ?? 50));

    if (options.maxHeight && options.sourceHeight && options.sourceHeight > options.maxHeight) {
        args.push('-vf', `scale=-2:${options.maxHeight}`);
    }

    if (options.bitrate) {
        args.push('-b:v', options.bitrate, '-maxrate', options.maxrate ?? options.bitrate, '-bufsize', options.bufsize ?? options.bitrate);
    }

    return args;
}
