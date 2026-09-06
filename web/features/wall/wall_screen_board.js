import { el, chip } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

const SHAPES = {
    '1': [1, 1],
    '4': [2, 2],
    '9': [3, 3],
    '16': [4, 4],
    '25': [5, 5],
    '36': [6, 6],
    '64': [8, 8]
};

export const TILE_AUTO = '';
export const TILE_EMPTY = 'none';

export function shapeFor(layout, cameraCount) {
    if (SHAPES[layout]) return SHAPES[layout];
    const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(cameraCount, 1))));
    return [columns, Math.max(1, Math.ceil(Math.max(cameraCount, 1) / columns))];
}

export function tileCount(layout, cameraCount) {
    const [columns, rows] = shapeFor(layout, cameraCount);
    return columns * rows;
}

function modeOf(assignment) {
    if (assignment === undefined) return 'auto';
    if (assignment === TILE_EMPTY) return 'empty';
    return 'camera';
}

function tileCell({ index, assignment, cameras, plan, onChange }) {
    const mode = modeOf(assignment);
    const camera = mode === 'camera' ? cameras.find((entry) => entry.id === assignment) : null;
    const automatic = plan.find((entry) => entry.index === index);

    const select = el('select', { className: 'screen-tile__select' });
    select.append(el('option', { value: TILE_AUTO, textContent: 'Automatico' }));
    select.append(el('option', { value: TILE_EMPTY, textContent: 'Lascia vuoto' }));

    for (const entry of cameras) {
        const option = el('option', { value: entry.id, textContent: entry.name });
        if (entry.id === assignment) option.selected = true;
        select.append(option);
    }

    if (mode === 'empty') select.value = TILE_EMPTY;
    if (mode === 'auto') select.value = TILE_AUTO;

    select.addEventListener('change', () => onChange(index, select.value));
    select.addEventListener('click', (event) => event.stopPropagation());

    const caption = mode === 'camera'
        ? camera?.name ?? 'canale rimosso'
        : (mode === 'empty' ? 'vuoto' : (automatic ? `auto · ${automatic.name}` : 'auto · libero'));

    return el('div', { className: `screen-tile screen-tile--${mode}` }, [
        el('span', { className: 'screen-tile__index', textContent: String(index + 1) }),
        el('span', { className: 'screen-tile__icon' }, [
            icon(mode === 'empty' ? 'close' : (mode === 'camera' ? 'camera' : 'sparkles'))
        ]),
        el('span', { className: 'screen-tile__caption', textContent: caption }),
        select
    ]);
}

export function renderScreenBoard({ screen, cameras, plan, onChange }) {
    const available = cameras.filter((camera) => camera.enabled && !screen.excluded.includes(camera.id));
    const [columns] = shapeFor(screen.layout, available.length);
    const total = tileCount(screen.layout, available.length);
    const assignments = new Map(screen.tiles.map((tile) => [tile.index, tile.cameraId]));

    const board = el('div', { className: 'screen-board' });
    board.style.setProperty('grid-template-columns', `repeat(${columns}, minmax(0, 1fr))`);

    for (let index = 0; index < total; index += 1) {
        board.append(tileCell({
            index,
            assignment: assignments.get(index),
            cameras: available,
            plan,
            onChange
        }));
    }

    const bezel = el('div', { className: 'screen-bezel' }, [
        board,
        el('span', { className: 'screen-bezel__stand' })
    ]);

    return el('div', { className: 'screen-frame' }, [
        el('div', { className: 'screen-frame__head' }, [
            icon('monitor'),
            el('strong', { textContent: screen.label }),
            chip(`${total} riquadri`, 'info'),
            chip(`${plan.length} in onda`, plan.length > 0 ? 'ok' : 'warn')
        ]),
        bezel,
        el('p', { className: 'screen-frame__hint', textContent: 'Automatico riempie il riquadro con la prima telecamera libera. Lascia vuoto lo esclude dal riempimento automatico, utile per lasciare spazi al marchio.' })
    ]);
}
