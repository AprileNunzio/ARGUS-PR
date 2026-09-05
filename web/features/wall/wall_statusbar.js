import { icon } from '/assets/icons.js';
import { DEFAULT_CLOCK, formatWallTime, formatWallDate } from './wall_clock.js';

export const LAYOUT_PRESETS = Object.freeze([
    { id: 'auto', label: 'Auto' },
    { id: '1', label: '1', cols: 1, rows: 1 },
    { id: '4', label: '4', cols: 2, rows: 2 },
    { id: '9', label: '9', cols: 3, rows: 3 },
    { id: '16', label: '16', cols: 4, rows: 4 },
    { id: '25', label: '25', cols: 5, rows: 5 },
    { id: '36', label: '36', cols: 6, rows: 6 },
    { id: '64', label: '64', cols: 8, rows: 8 }
]);

export function presetById(id) {
    return LAYOUT_PRESETS.find((preset) => preset.id === id) ?? LAYOUT_PRESETS[0];
}

function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined) continue;
        if (key === 'className' || key === 'textContent') node[key] = value;
        else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
        else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) {
        if (child) node.append(child);
    }
    return node;
}

export function createStatusBar(onLayoutChange) {
    const endpoint = el('span', { className: 'statusbar__ip', textContent: 'localhost' });
    const channels = el('span', { className: 'statusbar__value', textContent: '0' });
    const recording = el('span', { className: 'statusbar__value', textContent: '0' });
    const cpu = el('span', { className: 'statusbar__value', textContent: '--' });
    const ram = el('span', { className: 'statusbar__value', textContent: '--' });
    const gpu = el('span', { className: 'statusbar__value', textContent: '--' });
    const displayInfo = el('span', { className: 'statusbar__value', textContent: '--' });
    const version = el('span', { className: 'statusbar__value', textContent: '--' });
    const clockTime = el('span', { className: 'statusbar__clock', textContent: '--:--:--' });
    const linkDot = el('span', { className: 'statusbar__link-dot' });
    const linkLabel = el('span', { className: 'statusbar__value', textContent: 'attesa' });
    const clockDate = el('span', { className: 'statusbar__date' });

    let activeLayout = 'auto';
    let clockSettings = { ...DEFAULT_CLOCK };
    let timeZone = null;

    const layoutButtons = LAYOUT_PRESETS.map((preset) => {
        const button = el('button', {
            type: 'button',
            className: `wall-layout-btn ${preset.id === activeLayout ? 'wall-layout-btn--active' : ''}`,
            textContent: preset.label,
            title: `Visualizza griglia ${preset.label}`,
            onclick: () => {
                activeLayout = preset.id;
                for (const other of layoutButtons) other.classList.toggle('wall-layout-btn--active', other === button);
                onLayoutChange(preset);
            }
        });
        button.dataset.layout = preset.id;
        return button;
    });

    const layoutBar = el('div', { className: 'wall-layout-bar' }, layoutButtons);

    const slots = {};

    const item = (id, label, value) => {
        const node = el('span', { className: 'statusbar__item' }, [
            el('span', { className: 'statusbar__label', textContent: label }),
            value
        ]);
        slots[id] = node;
        return node;
    };

    const element = el('footer', { className: 'statusbar' }, [
        slots.brand = el('span', { className: 'statusbar__brand' }, [
            el('span', { className: 'statusbar__mark' }, [icon('shield')]),
            el('span', { textContent: 'ARGUS-PR' })
        ]),
        item('endpoint', 'IP Server', endpoint),
        slots.sync = el('span', { className: 'statusbar__item', title: 'Sincronizzazione live della configurazione' }, [
            el('span', { className: 'statusbar__label', textContent: 'Sync' }),
            linkDot,
            linkLabel
        ]),
        item('layout', 'Griglia', layoutBar),
        item('channels', 'Canali', channels),
        item('recording', 'REC', recording),
        el('span', { className: 'statusbar__spacer' }),
        item('outputs', 'Uscita', displayInfo),
        item('cpu', 'CPU', cpu),
        item('ram', 'RAM', ram),
        item('gpu', 'GPU', gpu),
        item('version', 'Versione', version),
        slots.clock = el('span', { className: 'statusbar__time' }, [clockDate, clockTime])
    ]);

    const tick = () => {
        const now = new Date();
        clockTime.textContent = formatWallTime(now, clockSettings, timeZone);
        const day = formatWallDate(now, clockSettings, timeZone);
        clockDate.textContent = day;
        clockDate.hidden = day.length === 0;
    };

    tick();
    const timer = setInterval(tick, 1000);

    let webUrl = 'https://localhost';

    const paintMetrics = (metrics) => {
        if (!metrics) return;
        cpu.textContent = metrics.cpuPercent === null ? '--' : `${metrics.cpuPercent}%`;
        ram.textContent = `${metrics.memory.usedPercent}%`;
        gpu.textContent = metrics.gpu.label;
    };

    return {
        element,
        get webUrl() { return webUrl; },
        metrics: paintMetrics,
        stop: () => clearInterval(timer),
        setClock(clock, zone) {
            clockSettings = { ...DEFAULT_CLOCK, ...(clock ?? {}) };
            timeZone = zone ?? null;
            tick();
        },
        setParts(parts) {
            if (!parts) return;
            element.hidden = parts.visible === false;
            for (const [id, node] of Object.entries(slots)) {
                if (node) node.hidden = parts[id] === false;
            }
        },
        setLink(state) {
            const online = state === 'online';
            linkDot.className = online ? 'statusbar__link-dot statusbar__link-dot--on' : 'statusbar__link-dot statusbar__link-dot--off';
            linkLabel.textContent = online ? 'live' : 'offline';
        },
        setLayout(layoutId) {
            activeLayout = layoutId;
            for (const button of layoutButtons) {
                button.classList.toggle('wall-layout-btn--active', button.dataset.layout === layoutId);
            }
        },
        setOutputs(outputs) {
            if (!Array.isArray(outputs) || outputs.length === 0) return;
            displayInfo.textContent = outputs.join(', ');
        },
        update(status) {
            const primary = status.addresses[0];
            const host = primary ? primary.address : 'localhost';
            const suffix = status.port === 443 ? '' : `:${status.port}`;
            webUrl = `https://${host}${suffix}`;
            endpoint.textContent = webUrl;
            channels.textContent = String(status.enabled);
            recording.textContent = String(status.recording);
            version.textContent = `v${status.version}`;

            if (status.displays && status.displays.length > 0) {
                const connected = status.displays.filter((display) => display.connected);
                displayInfo.textContent = connected.length > 0
                    ? connected.map((display) => display.label).join(', ')
                    : `${status.displays.length} uscite (nessun display)`;
            }

            paintMetrics(status.metrics);
        }
    };
}
