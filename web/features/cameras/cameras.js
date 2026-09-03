import { el, chip, empty, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { renderCameraWizard } from './camera_wizard.js';
import { renderCameraDetail } from './camera_detail.js';
import { SOURCE_KINDS } from './camera_form.js';

const KIND_LABELS = Object.fromEntries(SOURCE_KINDS.map((entry) => [entry.id, entry.title]));

function canManage(session) {
    return session.permissions.includes('camera.manage');
}

function sourceLabel(camera) {
    if (camera.sourceKind === 'usb') return camera.deviceId ?? 'periferica non configurata';
    return camera.mainStreamUrl ?? 'nessun flusso configurato';
}

function cameraCard({ camera, recorder, canEdit, onOpen }) {
    const recording = recorder ? recorder.enabled : false;

    const badges = el('div', { className: 'row row--tight' }, [
        camera.enabled ? chip('attivo', 'ok') : chip('disattivo', 'warn'),
        chip(camera.sourceKind === 'usb' ? 'USB' : camera.sourceKind.toUpperCase(), 'info'),
        recording ? chip('REC', 'bad') : null,
        camera.hasPassword ? chip('credenziali', 'violet') : null
    ]);

    const open = el('button', { className: 'btn btn--sm btn--primary', type: 'button', onclick: () => onOpen(camera) }, [
        icon('settings'),
        el('span', { textContent: canEdit ? 'Configura' : 'Dettagli' })
    ]);

    return el('article', { className: 'cam-card' }, [
        el('div', { className: 'cam-card__head' }, [
            el('span', { className: 'cam-card__icon' }, [icon(camera.sourceKind === 'usb' ? 'monitor' : 'camera', { className: 'icon--lg' })]),
            el('div', { className: 'stack stack--tight' }, [
                el('strong', { className: 'truncate', textContent: camera.name }),
                el('span', { className: 'section__hint truncate', textContent: camera.location ?? KIND_LABELS[camera.sourceKind] ?? camera.sourceKind })
            ])
        ]),
        badges,
        el('span', { className: 'mono truncate cam-card__source', textContent: sourceLabel(camera) }),
        el('div', { className: 'row row--between' }, [
            camera.group ? chip(camera.group) : el('span', { className: 'section__hint', textContent: 'senza gruppo' }),
            open
        ])
    ]);
}

function discoveryPanel({ result, canEdit, onAdopt, onClose }) {
    const devices = result.devices ?? [];

    return el('section', { className: 'panel rise' }, [
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title', textContent: `Dispositivi ONVIF rilevati (${devices.length})` }),
            el('button', { className: 'btn btn--sm btn--ghost', type: 'button', textContent: 'Chiudi', onclick: onClose })
        ]),
        el('div', { className: 'panel__body stack stack--tight' },
            devices.length === 0
                ? [empty('Nessun dispositivo ONVIF ha risposto sulla rete locale.')]
                : devices.map((device) => el('div', { className: 'device-row' }, [
                    el('div', { className: 'stack stack--tight' }, [
                        el('strong', { textContent: device.name ?? device.host }),
                        el('span', { className: 'section__hint', textContent: `${device.host}:${device.onvifPort} · ${device.hardware ?? 'modello sconosciuto'}` })
                    ]),
                    el('div', { className: 'row row--tight' }, [
                        chip('onvif', 'info'),
                        canEdit
                            ? el('button', { className: 'btn btn--sm', type: 'button', textContent: 'Aggiungi', onclick: () => onAdopt(device) })
                            : null
                    ])
                ]))
        )
    ]);
}

export async function renderCameras({ api, session }) {
    const outlet = el('div', { className: 'view' });
    const canEdit = canManage(session);

    const state = { selected: null, filter: '' };

    const refresh = async () => {
        const { cameras } = await api.get('/api/cameras');
        const { recorders } = await api.get('/api/recording').catch(() => ({ recorders: [] }));

        if (state.selected) {
            const camera = cameras.find((entry) => entry.id === state.selected);
            if (camera) {
                outlet.replaceChildren(renderCameraDetail({
                    api,
                    session,
                    camera,
                    recorder: recorders.find((entry) => entry.cameraId === camera.id),
                    onBack: () => { state.selected = null; refresh(); },
                    onChanged: refresh
                }));
                return;
            }
            state.selected = null;
        }

        const panelHost = el('div', {});

        const openCamera = (camera) => {
            state.selected = camera.id;
            refresh();
        };

        const closePanel = () => panelHost.replaceChildren();

        const openWizard = (prefill) => {
            panelHost.replaceChildren(renderCameraWizard({
                api,
                prefill,
                onSaved: async (camera) => {
                    closePanel();
                    openCamera(camera);
                },
                onCancel: closePanel
            }));
            panelHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        };

        const addButton = canEdit
            ? el('button', { className: 'btn btn--primary', type: 'button', onclick: () => openWizard(null) }, [
                icon('plus'),
                el('span', { textContent: 'Aggiungi canale' })
            ])
            : null;

        const discoverButton = canEdit
            ? el('button', { className: 'btn', type: 'button' }, [icon('search'), el('span', { textContent: 'Cerca ONVIF' })])
            : null;

        if (discoverButton) {
            discoverButton.addEventListener('click', async () => {
                discoverButton.disabled = true;
                const result = await api.post('/api/discovery/onvif', { timeoutMs: 4000 })
                    .catch((error) => ({ devices: [], error: error.message }));
                discoverButton.disabled = false;

                panelHost.replaceChildren(result.error
                    ? notice('error', result.error)
                    : discoveryPanel({
                        result,
                        canEdit,
                        onClose: closePanel,
                        onAdopt: (device) => openWizard({
                            sourceKind: 'rtsp',
                            name: device.name ?? device.host,
                            mainStreamUrl: `rtsp://${device.host}:554/`,
                            manufacturer: device.manufacturer ?? null,
                            model: device.hardware ?? null,
                            transport: 'tcp'
                        })
                    }));
            });
        }

        const search = el('input', {
            className: 'input',
            type: 'search',
            value: state.filter,
            placeholder: 'Filtra per nome, gruppo o posizione'
        });

        const grid = el('div', { className: 'cam-grid' });

        const paintGrid = () => {
            const needle = state.filter.trim().toLowerCase();
            const visible = cameras.filter((camera) => {
                if (needle.length === 0) return true;
                return [camera.name, camera.group, camera.location, camera.sourceKind]
                    .filter((value) => typeof value === 'string')
                    .some((value) => value.toLowerCase().includes(needle));
            });

            grid.replaceChildren(...(visible.length === 0
                ? [empty(cameras.length === 0
                    ? 'Nessun canale configurato. Aggiungi una telecamera di rete o una periferica USB per iniziare.'
                    : 'Nessun canale corrisponde al filtro.')]
                : visible.map((camera) => cameraCard({
                    camera,
                    recorder: recorders.find((entry) => entry.cameraId === camera.id),
                    canEdit,
                    onOpen: openCamera
                }))));
        };

        search.addEventListener('input', () => {
            state.filter = search.value;
            paintGrid();
        });

        paintGrid();

        outlet.replaceChildren(
            el('div', { className: 'view__head' }, [
                el('div', { className: 'stack stack--tight' }, [
                    el('h1', { className: 'view__title', textContent: 'Telecamere' }),
                    el('span', { className: 'section__hint', textContent: `${cameras.length} canali configurati · rete e periferiche locali` })
                ]),
                el('div', { className: 'row row--tight' }, [discoverButton, addButton])
            ]),
            el('div', { className: 'row' }, [search]),
            panelHost,
            grid
        );
    };

    window.addEventListener('argus:refresh-cameras', refresh);

    await refresh();
    return outlet;
}
