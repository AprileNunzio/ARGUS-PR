import test from 'node:test';
import assert from 'node:assert/strict';
import { parsers } from '../src/features/cameras/local_devices.js';

const DSHOW_LISTING = [
    '[dshow @ 000001f2a1] DirectShow video devices (some may be both video and audio devices)',
    '[dshow @ 000001f2a1]  "Integrated Camera" (video)',
    '[dshow @ 000001f2a1]     Alternative name "@device_pnp_\\\\?\\usb#vid_0bda"',
    '[dshow @ 000001f2a1]  "OBS Virtual Camera" (video)',
    '[dshow @ 000001f2a1] DirectShow audio devices',
    '[dshow @ 000001f2a1]  "Microfono (Realtek Audio)" (audio)'
].join('\n');

const DSHOW_OPTIONS = [
    '[dshow @ 000001f2a1]   vcodec=mjpeg  min s=1280x720 fps=5 max s=1280x720 fps=30',
    '[dshow @ 000001f2a1]   vcodec=mjpeg  min s=1280x720 fps=5 max s=1280x720 fps=60',
    '[dshow @ 000001f2a1]   pixel_format=yuyv422  min s=640x480 fps=5 max s=640x480 fps=30'
].join('\n');

const V4L2_LISTING = [
    '[video4linux2,v4l2 @ 0x5581] Compressed:       mjpeg :          Motion-JPEG : 1280x720 640x480',
    '[video4linux2,v4l2 @ 0x5581] Raw       :     yuyv422 :           YUYV 4:2:2 : 640x480 320x240'
].join('\n');

test('l elenco dshow tiene solo le periferiche video', () => {
    const devices = parsers.parseDshowDevices(DSHOW_LISTING);
    assert.deepEqual(devices.map((device) => device.id), ['Integrated Camera', 'OBS Virtual Camera']);
    assert.equal(devices.every((device) => device.driver === 'dshow'), true);
});

test('le opzioni dshow conservano la cadenza massima per formato e risoluzione', () => {
    const formats = parsers.parseDshowOptions(DSHOW_OPTIONS);
    assert.equal(formats.length, 2);
    assert.deepEqual(formats[0], { format: 'mjpeg', size: '1280x720', fps: 60 });
    assert.deepEqual(formats[1], { format: 'yuyv422', size: '640x480', fps: 30 });
});

test('i formati v4l2 espongono ogni risoluzione dichiarata', () => {
    const formats = parsers.parseV4l2Formats(V4L2_LISTING);
    assert.deepEqual(formats, [
        { format: 'mjpeg', size: '1280x720', fps: null },
        { format: 'mjpeg', size: '640x480', fps: null },
        { format: 'yuyv422', size: '640x480', fps: null },
        { format: 'yuyv422', size: '320x240', fps: null }
    ]);
});

test('un elenco vuoto non produce periferiche', () => {
    assert.deepEqual(parsers.parseDshowDevices(''), []);
    assert.deepEqual(parsers.parseV4l2Formats('nessun formato'), []);
});
