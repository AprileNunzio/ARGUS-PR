import { el, field, chip } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

export const SOURCE_KINDS = Object.freeze([
    { id: 'rtsp', title: 'Telecamera IP (RTSP)', hint: 'ONVIF, Hikvision, Dahua, Reolink, Axis', glyph: 'camera' },
    { id: 'mjpeg', title: 'Flusso MJPEG', hint: 'Webcam di rete, ESP32-CAM, DVR legacy', glyph: 'globe' },
    { id: 'http', title: 'Flusso HTTP', hint: 'HLS, MP4 remoto, sorgenti generiche', glyph: 'network' },
    { id: 'usb', title: 'Telecamera USB locale', hint: 'Webcam o acquisitore collegato al server', glyph: 'monitor' }
]);

const HWACCELS = Object.freeze([
    ['', 'Predefinita di sistema'], ['auto', 'Automatica'], ['none', 'Disattivata'],
    ['cuda', 'NVIDIA CUDA'], ['qsv', 'Intel Quick Sync'], ['d3d11va', 'Direct3D 11'],
    ['vaapi', 'VAAPI'], ['videotoolbox', 'VideoToolbox'], ['amf', 'AMD AMF']
]);

const INPUT_FORMATS = Object.freeze([
    ['', 'Automatico'], ['mjpeg', 'MJPEG compresso'], ['h264', 'H.264 compresso'],
    ['yuyv422', 'YUYV 4:2:2 grezzo'], ['nv12', 'NV12 grezzo']
]);

const RESOLUTIONS = Object.freeze([
    '640x480', '800x600', '1024x768', '1280x720', '1600x900', '1920x1080', '2560x1440', '3840x2160'
]);

function selectFrom(pairs, value) {
    return el('select', { className: 'select' }, pairs.map(([id, label]) => {
        const option = el('option', { value: id, textContent: label });
        if (String(value ?? '') === String(id)) option.setAttribute('selected', 'selected');
        return option;
    }));
}

function textInput(value, options = {}) {
    return el('input', {
        className: options.mono ? 'input input--mono' : 'input',
        type: options.type ?? 'text',
        value: value ?? '',
        placeholder: options.placeholder ?? '',
        autocomplete: options.autocomplete ?? 'off'
    });
}

function numberInput(value, min, max, placeholder) {
    return el('input', {
        className: 'input',
        type: 'number',
        min: String(min),
        max: String(max),
        value: value === null || value === undefined ? '' : String(value),
        placeholder: placeholder ?? ''
    });
}

function switchInput(checked) {
    const label = el('span', { className: 'switch__label', textContent: checked ? 'Attivo' : 'Disattivo' });
    const input = el('input', { type: 'checkbox', className: 'switch__input', checked });
    input.addEventListener('change', () => {
        label.textContent = input.checked ? 'Attivo' : 'Disattivo';
    });
    const control = el('label', { className: 'switch' }, [
        input,
        el('span', { className: 'switch__track' }, [el('span', { className: 'switch__thumb' })]),
        label
    ]);
    return { control, input };
}

function numberOrNull(input) {
    const parsed = Number.parseInt(input.value, 10);
    return Number.isInteger(parsed) ? parsed : null;
}

function textOrNull(input) {
    const value = input.value.trim();
    return value.length > 0 ? value : null;
}

function deviceSection({ api, camera }) {
    const deviceSelect = el('select', { className: 'select' }, [
        el('option', { value: '', textContent: 'Nessun dispositivo rilevato' })
    ]);
    const manual = textInput(camera?.deviceId ?? '', { mono: true, placeholder: 'Integrated Camera oppure /dev/video0' });
    const state = el('div', { className: 'section__hint', textContent: 'Premi Rileva per elencare le periferiche del server.' });
    const formatHost = el('div', { className: 'row row--tight' });

    let formatsByDevice = new Map();

    const applyDevice = (id) => {
        if (id.length > 0) manual.value = id;
        const formats = formatsByDevice.get(id) ?? [];
        formatHost.replaceChildren(...formats.slice(0, 8).map((entry) => chip(
            entry.fps ? `${entry.format} ${entry.size} @${entry.fps}` : `${entry.format} ${entry.size}`,
            'info'
        )));
    };

    const scanButton = el('button', { className: 'btn btn--sm', type: 'button' }, [
        icon('refresh'),
        el('span', { textContent: 'Rileva' })
    ]);

    scanButton.addEventListener('click', async () => {
        scanButton.disabled = true;
        state.textContent = 'Ricerca periferiche in corso…';

        const result = await api.get('/api/cameras/devices?formats=1').catch((error) => ({ devices: [], error: error.message }));
        scanButton.disabled = false;

        const devices = result.devices ?? [];
        formatsByDevice = new Map(devices.map((device) => [device.id, device.formats ?? []]));

        deviceSelect.replaceChildren(
            el('option', { value: '', textContent: devices.length === 0 ? 'Nessun dispositivo rilevato' : 'Seleziona una periferica' }),
            ...devices.map((device) => el('option', { value: device.id, textContent: `${device.label} · ${device.driver}` }))
        );

        state.textContent = result.error
            ? `Rilevamento non riuscito: ${result.error}`
            : devices.length === 0
                ? 'Nessuna periferica di acquisizione trovata sul server.'
                : `${devices.length} periferiche disponibili su ${result.platform}.`;

        if (camera?.deviceId && formatsByDevice.has(camera.deviceId)) {
            deviceSelect.value = camera.deviceId;
            applyDevice(camera.deviceId);
        }
    });

    deviceSelect.addEventListener('change', () => applyDevice(deviceSelect.value));

    const node = el('div', { className: 'form-grid' }, [
        el('div', { className: 'span-all row row--between' }, [
            el('span', { className: 'panel__title', textContent: 'Periferica di acquisizione' }),
            scanButton
        ]),
        el('div', { className: 'span-all' }, [field('Periferiche rilevate', deviceSelect)]),
        el('div', { className: 'span-all' }, [field('Identificativo periferica', manual)]),
        el('div', { className: 'span-all stack stack--tight' }, [state, formatHost])
    ]);

    return { node, manual };
}

function captureSection(camera) {
    const resolution = selectFrom(
        [['', 'Automatica (come da periferica)'], ...RESOLUTIONS.map((size) => [size, size])],
        camera?.captureWidth && camera?.captureHeight ? `${camera.captureWidth}x${camera.captureHeight}` : ''
    );
    const fps = numberInput(camera?.captureFps ?? null, 1, 240, 'automatici');
    const format = selectFrom(INPUT_FORMATS, camera?.inputFormat ?? '');

    const node = el('div', { className: 'form-grid' }, [
        field('Risoluzione di acquisizione', resolution),
        field('Fotogrammi al secondo', fps),
        field('Formato di ingresso', format)
    ]);

    return { node, resolution, fps, format };
}

function networkSection(camera) {
    const main = textInput(camera?.mainStreamUrl ?? '', { mono: true, placeholder: 'rtsp://192.168.1.64:554/Streaming/Channels/101' });
    const sub = textInput(camera?.subStreamUrl ?? '', { mono: true, placeholder: 'facoltativo, usato per analisi e anteprima' });
    const transport = selectFrom([['tcp', 'TCP (consigliato)'], ['udp', 'UDP']], camera?.transport ?? 'tcp');
    const username = textInput(camera?.username ?? '');
    const password = textInput('', {
        type: 'password',
        autocomplete: 'new-password',
        placeholder: camera?.hasPassword ? 'invariata' : ''
    });

    const node = el('div', { className: 'form-grid' }, [
        el('div', { className: 'span-all' }, [field('URL flusso principale', main)]),
        el('div', { className: 'span-all' }, [field('URL flusso secondario', sub)]),
        field('Trasporto RTSP', transport),
        field('Utente', username),
        field('Password', password)
    ]);

    return { node, main, sub, transport, username, password };
}

export function createCameraForm({ api, camera = null, kind }) {
    const sourceKind = kind ?? camera?.sourceKind ?? 'rtsp';
    const local = sourceKind === 'usb';

    const name = textInput(camera?.name ?? '', { placeholder: 'Ingresso principale' });
    const location = textInput(camera?.location ?? '', { placeholder: 'Cortile, reception, magazzino' });
    const group = textInput(camera?.group ?? '', { placeholder: 'Perimetro, interni, varchi' });
    const manufacturer = textInput(camera?.manufacturer ?? '');
    const model = textInput(camera?.model ?? '');
    const retention = numberInput(camera?.retentionDays ?? null, 1, 3650, 'come impostazione globale');
    const hwaccel = selectFrom(HWACCELS, camera?.hwaccel ?? '');
    const notes = el('textarea', { className: 'textarea', rows: '2', placeholder: 'Note operative, posizione fisica, contatti' });
    notes.value = camera?.notes ?? '';

    const enabled = switchInput(camera ? camera.enabled : true);
    const audio = switchInput(camera ? camera.audioEnabled : true);

    const network = local ? null : networkSection(camera);
    const device = local ? deviceSection({ api, camera }) : null;
    const capture = local ? captureSection(camera) : null;

    const node = el('div', { className: 'stack' }, [
        el('div', { className: 'form-grid' }, [
            field('Nome canale', name),
            field('Posizione', location),
            field('Gruppo', group)
        ]),
        local ? device.node : network.node,
        local ? capture.node : null,
        el('div', { className: 'form-grid' }, [
            field('Produttore', manufacturer),
            field('Modello', model),
            field('Ritenzione dedicata (giorni)', retention),
            field('Accelerazione hardware', hwaccel),
            field('Canale attivo', enabled.control),
            field('Registra audio', audio.control)
        ]),
        field('Note', notes)
    ]);

    function values() {
        const payload = {
            name: name.value.trim(),
            sourceKind,
            enabled: enabled.input.checked,
            audioEnabled: audio.input.checked,
            location: textOrNull(location),
            group: textOrNull(group),
            manufacturer: textOrNull(manufacturer),
            model: textOrNull(model),
            notes: textOrNull(notes),
            retentionDays: numberOrNull(retention),
            hwaccel: hwaccel.value.length > 0 ? hwaccel.value : null
        };

        if (local) {
            const size = capture.resolution.value.split('x');
            payload.deviceId = device.manual.value.trim();
            payload.inputFormat = capture.format.value.length > 0 ? capture.format.value : null;
            payload.captureWidth = size.length === 2 ? Number.parseInt(size[0], 10) : null;
            payload.captureHeight = size.length === 2 ? Number.parseInt(size[1], 10) : null;
            payload.captureFps = numberOrNull(capture.fps);
            return payload;
        }

        payload.mainStreamUrl = network.main.value.trim();
        payload.subStreamUrl = textOrNull(network.sub);
        payload.transport = network.transport.value;
        payload.username = textOrNull(network.username);

        const secret = network.password.value;
        if (secret.length > 0) payload.password = secret;

        return payload;
    }

    return { node, values, sourceKind, local };
}
