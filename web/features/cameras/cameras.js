import { el, chip, empty, notice, pageHead } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { go } from '/assets/router.js';
import { renderKindPage, renderNewCameraPage, renderDiscoveryPage } from './camera_wizard.js';
import { renderCameraDetail } from './camera_detail.js';
import { renderAutoconfigurePage } from './camera_autoconfig.js';
import { renderBrandProfilesPage } from './camera_brand_profiles.js';
import { SOURCE_KINDS } from './camera_form.js';

const KIND_LABELS = Object.fromEntries(SOURCE_KINDS.map((entry) => [entry.id, entry.title]));

function canManage(session) {
    return session.permissions.includes('camera.manage');
}

function sourceLabel(camera) {
    if (camera.sourceKind === 'usb') return camera.deviceId ?? 'periferica non configurata';
    return camera.mainStreamUrl ?? 'nessun flusso configurato';
}

function cameraCard({ camera, recorder, canEdit }) {
    const recording = recorder ? recorder.enabled : false;

    return el('article', { className: 'cam-card' }, [
        el('div', { className: 'cam-card__head' }, [
            el('span', { className: 'cam-card__icon' }, [icon(camera.sourceKind === 'usb' ? 'monitor' : 'camera', { className: 'icon--lg' })]),
            el('div', { className: 'stack stack--tight' }, [
                el('strong', { className: 'truncate', textContent: camera.name }),
                el('span', { className: 'section__hint truncate', textContent: camera.location ?? KIND_LABELS[camera.sourceKind] ?? camera.sourceKind })
            ])
        ]),
        el('div', { className: 'row row--tight' }, [
            camera.enabled ? chip('attivo', 'ok') : chip('disattivo', 'warn'),
            chip(camera.sourceKind === 'usb' ? 'USB' : camera.sourceKind.toUpperCase(), 'info'),
            recording ? chip('REC', 'bad') : null,
            camera.hasPassword ? chip('credenziali', 'violet') : null
        ]),
        el('span', { className: 'mono truncate cam-card__source', textContent: sourceLabel(camera) }),
        el('div', { className: 'row row--between' }, [
            camera.group ? chip(camera.group) : el('span', { className: 'section__hint', textContent: 'senza gruppo' }),
            el('button', {
                className: 'btn btn--sm btn--primary',
                type: 'button',
                onclick: () => go('cameras', camera.id)
            }, [icon('settings'), el('span', { textContent: canEdit ? 'Configura' : 'Dettagli' })])
        ])
    ]);
}

async function renderList({ api, session }) {
    const outlet = el('div', { className: 'view' });
    const canEdit = canManage(session);

    const { cameras } = await api.get('/api/cameras');
    const { recorders } = await api.get('/api/recording').catch(() => ({ recorders: [] }));

    const grid = el('div', { className: 'cam-grid' });
    const search = el('input', { className: 'input', type: 'search', placeholder: 'Filtra per nome, gruppo o posizione' });

    const paint = () => {
        const needle = search.value.trim().toLowerCase();
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
                canEdit
            }))));
    };

    search.addEventListener('input', paint);
    paint();

    outlet.append(
        pageHead({
            title: 'Telecamere',
            hint: `${cameras.length} canali configurati · rete e periferiche locali`,
            actions: canEdit
                ? [
                    el('button', { className: 'btn', type: 'button', onclick: () => go('cameras', 'profiles') }, [
                        icon('settings'),
                        el('span', { textContent: 'Profili Marche' })
                    ]),
                    el('button', { className: 'btn', type: 'button', onclick: () => go('cameras', 'discover') }, [
                        icon('search'),
                        el('span', { textContent: 'Cerca ONVIF' })
                    ]),
                    el('button', { className: 'btn btn--primary', type: 'button', onclick: () => go('cameras', 'new') }, [
                        icon('plus'),
                        el('span', { textContent: 'Aggiungi canale' })
                    ])
                ]
                : []
        }),
        el('div', { className: 'row' }, [search]),
        grid
    );

    return outlet;
}

async function renderDetailPage({ api, session, cameraId, tab }) {
    const camera = await api.get(`/api/cameras/${cameraId}`)
        .then((result) => result.camera)
        .catch(() => null);

    if (!camera) {
        return el('div', { className: 'view' }, [
            pageHead({ title: 'Canale non trovato', hint: 'Il canale richiesto non esiste piu' }),
            notice('warn', 'Torna all elenco per vedere i canali disponibili.'),
            el('div', { className: 'row' }, [
                el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Elenco telecamere', onclick: () => go('cameras') })
            ])
        ]);
    }

    const { recorders } = await api.get('/api/recording').catch(() => ({ recorders: [] }));

    return renderCameraDetail({
        api,
        session,
        camera,
        tab,
        recorder: recorders.find((entry) => entry.cameraId === camera.id)
    });
}

export async function renderCameras({ api, session, params = [] }) {
    const [first, second] = params;

    if (first === 'new') return second ? renderNewCameraPage({ api, kind: second }) : renderKindPage();
    if (first === 'discover') return renderDiscoveryPage({ api });
    if (first === 'profiles') return renderBrandProfilesPage();

    if (first && second === 'autoconfig') return renderAutoconfigurePage({ api, cameraId: first });
    if (first) return renderDetailPage({ api, session, cameraId: first, tab: second ?? 'general' });

    return renderList({ api, session });
}
