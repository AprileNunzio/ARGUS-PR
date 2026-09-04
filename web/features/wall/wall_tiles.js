import { el, chip } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { segmented, toggle, optionRow } from '/assets/ui.js';

const SHAPES = {
    '1': [1, 1],
    '4': [2, 2],
    '9': [3, 3],
    '16': [4, 4],
    '25': [5, 5],
    '36': [6, 6],
    '64': [8, 8]
};

export function shapeFor(layout, cameraCount) {
    if (SHAPES[layout]) return SHAPES[layout];
    const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(cameraCount, 1))));
    return [columns, Math.max(1, Math.ceil(Math.max(cameraCount, 1) / columns))];
}

export function tileCount(layout, cameraCount) {
    const [columns, rows] = shapeFor(layout, cameraCount);
    return columns * rows;
}

export function renderTileBoard({ layout, cameras, config, onAssign }) {
    const available = cameras.filter((camera) => camera.enabled && !config.excluded.includes(camera.id));
    const [columns] = shapeFor(layout, available.length);
    const total = tileCount(layout, available.length);
    const board = el('div', { className: 'tile-board' });
    board.style.setProperty('grid-template-columns', `repeat(${columns}, minmax(0, 1fr))`);

    const assignment = new Map(config.tiles.map((tile) => [tile.index, tile.cameraId]));

    for (let index = 0; index < total; index += 1) {
        const cameraId = assignment.get(index) ?? '';
        const camera = available.find((entry) => entry.id === cameraId) ?? null;

        const select = el('select', { className: 'tile-cell__select' });
        select.append(el('option', { value: '', textContent: 'Automatico' }));
        for (const entry of available) {
            const option = el('option', { value: entry.id, textContent: entry.name });
            if (entry.id === cameraId) option.selected = true;
            select.append(option);
        }
        select.addEventListener('change', () => onAssign(index, select.value));

        board.append(el('div', { className: camera ? 'tile-cell tile-cell--filled' : 'tile-cell' }, [
            el('span', { className: 'tile-cell__index', textContent: String(index + 1) }),
            el('span', { className: 'tile-cell__icon' }, [icon(camera ? 'camera' : 'crop')]),
            select
        ]));
    }

    return board;
}

export function renderCameraRoster({ cameras, config, onExclude, onQuality }) {
    if (cameras.length === 0) {
        return el('div', { className: 'empty' }, [
            icon('camera', { className: 'icon--xl' }),
            el('p', { textContent: 'Nessuna telecamera registrata. Aggiungine una da Sistema › Telecamere.' })
        ]);
    }

    return el('div', { className: 'roster' }, cameras.map((camera) => {
        const excluded = config.excluded.includes(camera.id);
        const quality = config.quality[camera.id] ?? config.defaultQuality;
        const warning = quality === 'sub' && !camera.hasSubStream && camera.sourceKind !== 'usb';

        const qualityControl = segmented([
            { value: 'sub', label: 'Sub SD', icon: 'zap', hint: 'Flusso secondario a basso bitrate, consigliato per il muro' },
            { value: 'main', label: 'Main HD', icon: 'sparkles', hint: 'Flusso principale ad alta risoluzione, richiede piu banda e CPU' }
        ], quality, (value) => onQuality(camera.id, value), { compact: true });

        return el('div', { className: excluded ? 'roster__row roster__row--off' : 'roster__row' }, [
            el('div', { className: 'roster__lead' }, [
                el('span', { className: 'roster__avatar' }, [icon('camera')]),
                el('div', { className: 'roster__text' }, [
                    el('span', { className: 'roster__name', textContent: camera.name }),
                    el('span', { className: 'roster__meta' }, [
                        chip(camera.enabled ? 'Attiva' : 'Disattivata', camera.enabled ? 'ok' : 'bad'),
                        chip(String(camera.sourceKind ?? 'rtsp').toUpperCase(), 'info'),
                        camera.hasSubStream ? chip('Sub disponibile', 'ok') : chip('Nessun sub-stream', 'warn')
                    ])
                ])
            ]),
            el('div', { className: 'roster__controls' }, [
                qualityControl,
                toggle(!excluded, (value) => onExclude(camera.id, !value), ['Nel muro', 'Esclusa'])
            ]),
            warning ? el('p', { className: 'roster__warning' }, [
                icon('warning'),
                el('span', { textContent: 'Questa telecamera non espone un sub-stream: il muro usera il flusso principale, con piu carico su CPU e rete.' })
            ]) : null
        ]);
    }));
}

export function renderOutputBoard({ displays, config, onToggle, onPrimary }) {
    if (displays.length === 0) {
        return el('div', { className: 'empty' }, [
            icon('monitor', { className: 'icon--xl' }),
            el('p', { textContent: 'Nessuna uscita video rilevata su questo server.' })
        ]);
    }

    const states = new Map(config.outputs.map((output) => [output.id, output.enabled]));

    return el('div', { className: 'stack stack--tight' }, displays.map((display) => {
        const enabled = states.get(display.id) ?? display.connected;
        const isPrimary = config.primaryOutput === display.id;

        const primaryButton = el('button', {
            type: 'button',
            className: isPrimary ? 'btn btn--sm btn--primary' : 'btn btn--sm',
            textContent: isPrimary ? 'Uscita principale' : 'Imposta principale',
            onclick: () => onPrimary(display.id)
        });

        return optionRow({
            title: display.label,
            hint: `${display.connector} · ${display.connected ? 'monitor collegato' : 'nessun segnale rilevato'}`,
            iconName: 'monitor',
            tone: display.connected ? null : 'muted',
            control: el('div', { className: 'row row--tight row--nowrap' }, [
                primaryButton,
                toggle(enabled, (value) => onToggle(display.id, value), ['Abilitata', 'Disabilitata'])
            ])
        });
    }));
}
