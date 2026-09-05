import { icon } from '/assets/icons.js';

const LAYOUT = [
    { direction: 'up-left', glyph: 'arrowUpLeft', label: 'Alto sinistra' },
    { direction: 'up', glyph: 'arrowUp', label: 'Alto' },
    { direction: 'up-right', glyph: 'arrowUpRight', label: 'Alto destra' },
    { direction: 'left', glyph: 'arrowLeft', label: 'Sinistra' },
    { direction: 'home', glyph: 'home', label: 'Posizione di riposo' },
    { direction: 'right', glyph: 'arrowRight', label: 'Destra' },
    { direction: 'down-left', glyph: 'arrowDownLeft', label: 'Basso sinistra' },
    { direction: 'down', glyph: 'arrowDown', label: 'Basso' },
    { direction: 'down-right', glyph: 'arrowDownRight', label: 'Basso destra' }
];

const ZOOM = [
    { direction: 'zoom-in', glyph: 'plus', label: 'Zoom avanti' },
    { direction: 'zoom-out', glyph: 'minus', label: 'Zoom indietro' }
];

function node(tag, props = {}, children = []) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined) continue;
        if (key === 'className' || key === 'textContent') element[key] = value;
        else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2).toLowerCase(), value);
        else element.setAttribute(key, value);
    }
    for (const child of [].concat(children)) {
        if (child) element.append(child);
    }
    return element;
}

export function createPtzPad({ cameraId, onNotice, request }) {
    const element = node('div', { className: 'console__ptz', hidden: 'hidden' });
    let busy = false;

    const drive = async (button, direction) => {
        if (busy) return;
        busy = true;
        button.disabled = true;

        const path = direction === 'home'
            ? `/api/ptz/${encodeURIComponent(cameraId)}/home`
            : `/api/ptz/${encodeURIComponent(cameraId)}/move`;

        await request(path, direction === 'home' ? {} : { direction, speed: 0.7, durationMs: 500 })
            .catch((error) => onNotice(`PTZ: ${error.message}`));

        button.disabled = false;
        busy = false;
    };

    const pad = LAYOUT.map((entry) => {
        const button = node('button', {
            type: 'button',
            className: entry.direction === 'home' ? 'console__ptz-btn console__ptz-btn--home' : 'console__ptz-btn',
            title: entry.label,
            'aria-label': entry.label,
            onclick: (event) => {
                event.stopPropagation();
                drive(button, entry.direction);
            }
        }, [icon(entry.glyph)]);

        return button;
    });

    const zoom = node('div', { className: 'console__ptz-zoom' }, ZOOM.map((entry) => {
        const button = node('button', {
            type: 'button',
            className: 'console__ptz-btn',
            title: entry.label,
            'aria-label': entry.label,
            onclick: (event) => {
                event.stopPropagation();
                drive(button, entry.direction);
            }
        }, [icon(entry.glyph)]);

        return button;
    }));

    element.append(...pad, zoom);

    return {
        element,
        toggle() {
            element.hidden = !element.hidden;
            return !element.hidden;
        },
        hide() {
            element.hidden = true;
        }
    };
}
