import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInput, buildCaptureArgs, buildProbeArgs, requireDeviceId, isLocalKind, setRtspTimeoutOption } from '../src/features/cameras/camera_input.js';

const ipCamera = {
    sourceKind: 'rtsp',
    mainStreamUrl: 'rtsp://192.168.1.64:554/Streaming/Channels/101',
    subStreamUrl: 'rtsp://192.168.1.64:554/Streaming/Channels/102',
    username: 'admin',
    password: 'segreta',
    transport: 'tcp'
};

const usbCamera = {
    sourceKind: 'usb',
    deviceId: 'Integrated Camera',
    inputFormat: 'mjpeg',
    captureWidth: 1280,
    captureHeight: 720,
    captureFps: 30
};

test('la sorgente RTSP inietta credenziali, trasporto e timeout', () => {
    const input = resolveInput(ipCamera);
    const args = buildCaptureArgs(input);

    assert.equal(input.local, false);
    assert.equal(input.target, 'rtsp://admin:segreta@192.168.1.64:554/Streaming/Channels/101');
    assert.equal(input.label.includes('segreta'), false);
    assert.deepEqual(args.slice(-2), ['-i', input.target]);
    assert.equal(args.includes('-rtsp_transport'), true);
    assert.equal(args[args.indexOf('-rtsp_transport') + 1], 'tcp');
    assert.equal(args.includes('-timeout'), true);
    assert.equal(args.includes('-stimeout'), false);
});

test('l opzione di timeout RTSP segue quella supportata dal binario', () => {
    setRtspTimeoutOption('stimeout');
    assert.equal(buildCaptureArgs(resolveInput(ipCamera)).includes('-stimeout'), true);

    setRtspTimeoutOption(null);
    const bare = buildCaptureArgs(resolveInput(ipCamera));
    assert.equal(bare.includes('-stimeout'), false);
    assert.equal(bare.includes('-timeout'), false);

    setRtspTimeoutOption('timeout');
    assert.equal(buildCaptureArgs(resolveInput(ipCamera)).includes('-timeout'), true);
});

test('preferSub sceglie il flusso secondario quando esiste', () => {
    assert.equal(resolveInput(ipCamera, { preferSub: true }).target.endsWith('/102'), true);
    assert.equal(resolveInput(ipCamera, { preferSub: false }).target.endsWith('/101'), true);

    const onlyMain = { ...ipCamera, subStreamUrl: null };
    assert.equal(resolveInput(onlyMain, { preferSub: true }).target.endsWith('/101'), true);
});

test('il trasporto UDP viene rispettato', () => {
    const args = buildCaptureArgs(resolveInput({ ...ipCamera, transport: 'udp' }));
    assert.equal(args[args.indexOf('-rtsp_transport') + 1], 'udp');
});

test('le sorgenti HTTP usano la riconnessione, non il trasporto RTSP', () => {
    const args = buildCaptureArgs(resolveInput({
        sourceKind: 'mjpeg',
        mainStreamUrl: 'http://192.168.1.90/video.mjpg',
        transport: 'tcp'
    }));

    assert.equal(args.includes('-rtsp_transport'), false);
    assert.equal(args.includes('-reconnect'), true);
});

test('la telecamera USB su Windows usa dshow con formato, risoluzione e cadenza', () => {
    const input = resolveInput(usbCamera, { platform: 'win32' });
    const args = buildCaptureArgs(input);

    assert.equal(input.local, true);
    assert.equal(input.target, 'video=Integrated Camera');
    assert.deepEqual(args, [
        '-hide_banner', '-loglevel', 'error', '-nostdin',
        '-f', 'dshow', '-rtbufsize', '256M',
        '-vcodec', 'mjpeg', '-video_size', '1280x720', '-framerate', '30',
        '-thread_queue_size', '1024',
        '-i', 'video=Integrated Camera'
    ]);
});

test('la telecamera USB su Linux usa v4l2 con il nodo di dispositivo', () => {
    const input = resolveInput({ ...usbCamera, deviceId: '/dev/video0' }, { platform: 'linux' });
    const args = buildCaptureArgs(input);

    assert.equal(input.target, '/dev/video0');
    assert.equal(args[args.indexOf('-f') + 1], 'v4l2');
    assert.equal(args[args.indexOf('-input_format') + 1], 'mjpeg');
    assert.equal(args[args.indexOf('-video_size') + 1], '1280x720');
});

test('la telecamera USB su macOS usa avfoundation con indice del dispositivo', () => {
    const args = buildCaptureArgs(resolveInput({ ...usbCamera, deviceId: '0' }, { platform: 'darwin' }));
    assert.equal(args[args.indexOf('-f') + 1], 'avfoundation');
    assert.deepEqual(args.slice(-2), ['-i', '0']);
});

test('i formati raw usano pixel_format su Windows', () => {
    const args = buildCaptureArgs(resolveInput({ ...usbCamera, inputFormat: 'yuyv422' }, { platform: 'win32' }));
    assert.equal(args.includes('-pixel_format'), true);
    assert.equal(args.includes('-vcodec'), false);
});

test('le sorgenti locali non ricevono i flag di bassa latenza di rete', () => {
    const args = buildCaptureArgs(resolveInput(usbCamera, { platform: 'linux' }));
    assert.equal(args.includes('-fflags'), false);
});

test('gli argomenti di analisi non contengono flag esclusivi di ffmpeg', () => {
    const args = buildProbeArgs(resolveInput(ipCamera), ['-show_streams']);
    assert.equal(args.includes('-nostdin'), false);
    assert.equal(args.includes('-fflags'), false);
    assert.equal(args.includes('-thread_queue_size'), false);
    assert.equal(args.at(-1), 'rtsp://admin:segreta@192.168.1.64:554/Streaming/Channels/101');

    const local = buildProbeArgs(resolveInput(usbCamera, { platform: 'win32' }), ['-show_streams']);
    assert.equal(local.includes('-thread_queue_size'), false);
    assert.equal(local.includes('-nostdin'), false);
    assert.equal(local.includes('-rtbufsize'), true);
    assert.equal(local.at(-1), 'video=Integrated Camera');
});

test('un identificativo di periferica ostile viene rifiutato', () => {
    assert.throws(() => requireDeviceId('video=x; rm -rf /', 'Capture device'));
    assert.throws(() => requireDeviceId('"quoted"', 'Capture device'));
    assert.throws(() => requireDeviceId('', 'Capture device'));
    assert.equal(requireDeviceId(' /dev/video1 '), '/dev/video1');
});

test('una risoluzione fuori scala viene ignorata invece di finire negli argomenti', () => {
    const args = buildCaptureArgs(resolveInput({ ...usbCamera, captureWidth: 99999, captureHeight: 4 }, { platform: 'linux' }));
    assert.equal(args.includes('-video_size'), false);
});

test('una sorgente sconosciuta viene rifiutata', () => {
    assert.throws(() => resolveInput({ sourceKind: 'telnet', mainStreamUrl: 'rtsp://x/y' }));
    assert.throws(() => resolveInput({ sourceKind: 'rtsp', mainStreamUrl: 'file:///etc/passwd' }));
    assert.equal(isLocalKind('usb'), true);
    assert.equal(isLocalKind('rtsp'), false);
});

test('la scelta dell encoder scarta quelli che l hardware non sa aprire', async () => {
    const { pickEncoder } = await import('../src/features/streaming/encoder.js');
    const { candidateEncoders } = await import('../src/platform/encoder_probe.js');

    assert.equal(pickEncoder(['cuda'], 'auto'), 'h264_nvenc');
    assert.equal(pickEncoder(['cuda'], 'auto', ['libx264']), 'libx264');
    assert.equal(pickEncoder(['cuda', 'qsv'], 'auto', ['h264_qsv', 'libx264']), 'h264_qsv');
    assert.equal(pickEncoder(['cuda'], 'h264_nvenc', ['libx264']), 'libx264');
    assert.equal(pickEncoder([], 'auto', ['libx264']), 'libx264');

    assert.deepEqual(candidateEncoders(['cuda', 'qsv']), ['h264_nvenc', 'h264_qsv', 'h264_v4l2m2m', 'libx264']);
    assert.deepEqual(candidateEncoders([]), ['h264_v4l2m2m', 'libx264']);

    assert.equal(pickEncoder([], 'auto', ['h264_v4l2m2m', 'libx264']), 'h264_v4l2m2m');
    assert.equal(pickEncoder([], 'auto', ['libx264']), 'libx264');
});
