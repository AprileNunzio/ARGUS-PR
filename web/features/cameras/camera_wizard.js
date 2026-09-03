import { el, notice, chip, pageHead } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { go } from '/assets/router.js';
import { createCameraForm, SOURCE_KINDS } from './camera_form.js';

let pendingPrefill = null;

export function stashPrefill(values) {
    pendingPrefill = values;
}

export function takePrefill() {
    const values = pendingPrefill;
    pendingPrefill = null;
    return values;
}

export function backLink(label, ...target) {
    return el('button', { className: 'page-back', type: 'button', onclick: () => go(...target) }, [
        icon('close'),
        el('span', { textContent: label })
    ]);
}

export function probeSummary(result) {
    const items = [];

    if (result.video) {
        items.push(chip(`${result.video.width ?? '?'}x${result.video.height ?? '?'}`, 'ok'));
        items.push(chip(result.video.codec ?? 'video', 'info'));
        if (result.video.frameRate) items.push(chip(`${result.video.frameRate} fps`, 'info'));
    }

    if (result.audio) items.push(chip(`audio ${result.audio.codec}`, 'info'));
    if (result.container) items.push(chip(result.container, 'info'));

    return el('div', { className: 'row row--tight' }, items);
}

function kindCard(entry) {
    return el('button', {
        className: 'kind-card',
        type: 'button',
        onclick: () => go('cameras', 'new', entry.id)
    }, [
        el('span', { className: 'kind-card__icon' }, [icon(entry.glyph, { className: 'icon--lg' })]),
        el('span', { className: 'kind-card__body' }, [
            el('strong', { textContent: entry.title }),
            el('span', { className: 'section__hint', textContent: entry.hint })
        ])
    ]);
}

export function renderKindPage() {
    return el('div', { className: 'view' }, [
        pageHead({
            title: 'Nuovo canale',
            hint: 'Da dove arriva il video di questa telecamera',
            back: backLink('Torna all elenco', 'cameras')
        }),
        el('section', { className: 'panel' }, [
            el('div', { className: 'panel__body' }, [
                el('div', { className: 'kind-grid' }, SOURCE_KINDS.map(kindCard))
            ])
        ])
    ]);
}

export function renderNewCameraPage({ api, kind }) {
    const descriptor = SOURCE_KINDS.find((entry) => entry.id === kind);
    if (!descriptor) return renderKindPage();

    const prefill = takePrefill();
    const form = createCameraForm({ api, kind, camera: prefill });
    const feedback = el('div', { hidden: 'hidden' });

    const probeButton = el('button', { className: 'btn', type: 'button', textContent: 'Verifica sorgente' });
    const saveButton = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Salva canale' });

    const fail = (error) => {
        feedback.replaceChildren(notice('error', error.message));
        feedback.removeAttribute('hidden');
    };

    probeButton.addEventListener('click', async () => {
        probeButton.disabled = true;
        probeButton.textContent = 'Verifica in corso…';
        feedback.setAttribute('hidden', 'hidden');

        const outcome = await api.post('/api/cameras/probe', form.values())
            .then((result) => ({ result }))
            .catch((error) => ({ error }));

        probeButton.disabled = false;
        probeButton.textContent = 'Verifica sorgente';

        if (outcome.error) return fail(outcome.error);

        feedback.replaceChildren(notice('ok', 'Sorgente raggiungibile.'), probeSummary(outcome.result));
        feedback.removeAttribute('hidden');
    });

    saveButton.addEventListener('click', async () => {
        saveButton.disabled = true;
        feedback.setAttribute('hidden', 'hidden');

        const outcome = await api.post('/api/cameras', form.values())
            .then((result) => ({ result }))
            .catch((error) => ({ error }));

        saveButton.disabled = false;

        if (outcome.error) return fail(outcome.error);
        go('cameras', outcome.result.camera.id);
    });

    return el('div', { className: 'view' }, [
        pageHead({
            title: descriptor.title,
            hint: descriptor.hint,
            back: backLink('Cambia tipo di sorgente', 'cameras', 'new')
        }),
        el('section', { className: 'panel' }, [
            el('div', { className: 'panel__body stack' }, [
                form.node,
                feedback,
                el('div', { className: 'row row--end' }, [
                    el('button', { className: 'btn', type: 'button', textContent: 'Annulla', onclick: () => go('cameras') }),
                    probeButton,
                    saveButton
                ])
            ])
        ])
    ]);
}

export async function renderDiscoveryPage({ api }) {
    const outlet = el('div', { className: 'view' });
    const body = el('div', { className: 'panel__body stack stack--tight' }, [
        el('span', { className: 'section__hint', textContent: 'Ricerca in corso sulla rete locale…' })
    ]);

    const scanButton = el('button', { className: 'btn', type: 'button' }, [
        icon('refresh'),
        el('span', { textContent: 'Cerca di nuovo' })
    ]);

    const paint = (result) => {
        const devices = result.devices ?? [];

        if (result.error) {
            body.replaceChildren(notice('error', result.error));
            return;
        }

        if (devices.length === 0) {
            body.replaceChildren(el('div', { className: 'empty', textContent: 'Nessun dispositivo ONVIF ha risposto sulla rete locale.' }));
            return;
        }

        body.replaceChildren(...devices.map((device) => el('div', { className: 'device-row' }, [
            el('div', { className: 'stack stack--tight' }, [
                el('strong', { textContent: device.name ?? device.host }),
                el('span', { className: 'section__hint', textContent: `${device.host}:${device.onvifPort} · ${device.hardware ?? 'modello sconosciuto'}` })
            ]),
            el('div', { className: 'row row--tight' }, [
                chip('onvif', 'info'),
                el('button', {
                    className: 'btn btn--sm btn--primary',
                    type: 'button',
                    textContent: 'Aggiungi',
                    onclick: () => {
                        stashPrefill({
                            sourceKind: 'rtsp',
                            name: device.name ?? device.host,
                            mainStreamUrl: `rtsp://${device.host}:554/`,
                            manufacturer: device.manufacturer ?? null,
                            model: device.hardware ?? null,
                            transport: 'tcp'
                        });
                        go('cameras', 'new', 'rtsp');
                    }
                })
            ])
        ])));
    };

    const scan = async () => {
        scanButton.disabled = true;
        body.replaceChildren(el('span', { className: 'section__hint', textContent: 'Ricerca in corso sulla rete locale…' }));

        const result = await api.post('/api/discovery/onvif', { timeoutMs: 4000 })
            .catch((error) => ({ devices: [], error: error.message }));

        scanButton.disabled = false;
        paint(result);
    };

    scanButton.addEventListener('click', scan);

    outlet.append(
        pageHead({
            title: 'Ricerca ONVIF',
            hint: 'Dispositivi che rispondono al protocollo di scoperta sulla rete locale',
            actions: [scanButton],
            back: backLink('Torna all elenco', 'cameras')
        }),
        el('section', { className: 'panel' }, [body])
    );

    scan();
    return outlet;
}
