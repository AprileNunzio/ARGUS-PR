import test from 'node:test';
import assert from 'node:assert/strict';
import { readCameraInput } from '../src/features/cameras/camera_payload.js';

test('una telecamera di rete richiede un URL valido', () => {
    const payload = readCameraInput({
        name: 'Ingresso',
        sourceKind: 'rtsp',
        mainStreamUrl: 'rtsp://192.168.1.64:554/live',
        transport: 'udp',
        username: 'admin',
        password: 'segreta'
    });

    assert.equal(payload.sourceKind, 'rtsp');
    assert.equal(payload.transport, 'udp');
    assert.equal(payload.deviceId, undefined);
    assert.throws(() => readCameraInput({ name: 'X', sourceKind: 'rtsp' }));
    assert.throws(() => readCameraInput({ name: 'X', sourceKind: 'rtsp', mainStreamUrl: 'file:///etc/shadow' }));
});

test('una telecamera USB richiede la periferica e non porta URL', () => {
    const payload = readCameraInput({
        name: 'Webcam banco',
        sourceKind: 'usb',
        deviceId: '/dev/video0',
        inputFormat: 'mjpeg',
        captureWidth: 1280,
        captureHeight: 720,
        captureFps: 25
    });

    assert.equal(payload.deviceId, '/dev/video0');
    assert.equal(payload.mainStreamUrl, null);
    assert.equal(payload.captureFps, 25);
    assert.throws(() => readCameraInput({ name: 'Webcam', sourceKind: 'usb' }));
});

test('i valori fuori intervallo vengono respinti', () => {
    assert.throws(() => readCameraInput({ name: 'X', sourceKind: 'usb', deviceId: '/dev/video0', captureFps: 999 }));
    assert.throws(() => readCameraInput({ name: 'X', sourceKind: 'usb', deviceId: '/dev/video0', captureWidth: 8 }));
    assert.throws(() => readCameraInput({ name: 'X', sourceKind: 'rtsp', mainStreamUrl: 'rtsp://h/s', retentionDays: 99999 }));
    assert.throws(() => readCameraInput({ name: 'X', sourceKind: 'rtsp', mainStreamUrl: 'rtsp://h/s', hwaccel: 'magic' }));
});

test('un aggiornamento parziale non impone i campi assenti', () => {
    const payload = readCameraInput({ location: 'Cortile' }, { partial: true, currentKind: 'rtsp' });
    assert.deepEqual(payload, { location: 'Cortile' });

    const renamed = readCameraInput({ name: 'Nuovo nome' }, { partial: true, currentKind: 'usb' });
    assert.deepEqual(renamed, { name: 'Nuovo nome' });
});

test('un aggiornamento parziale valida comunque i campi presenti', () => {
    assert.throws(() => readCameraInput({ mainStreamUrl: 'nonUnUrl' }, { partial: true, currentKind: 'rtsp' }));
    assert.throws(() => readCameraInput({ deviceId: 'video=x;rm -rf /' }, { partial: true, currentKind: 'usb' }));
});

test('i campi vuoti diventano null invece di stringhe vuote', () => {
    const payload = readCameraInput({
        name: 'Ingresso',
        sourceKind: 'rtsp',
        mainStreamUrl: 'rtsp://h/s',
        location: '',
        group: '',
        notes: '',
        retentionDays: ''
    });

    assert.equal(payload.location, null);
    assert.equal(payload.group, null);
    assert.equal(payload.notes, null);
    assert.equal(payload.retentionDays, null);
});
