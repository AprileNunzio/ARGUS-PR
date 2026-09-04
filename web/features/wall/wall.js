import { createLivePlayer, isPlaybackSupported } from '/features/live/player.js';
import { icon } from '/assets/icons.js';

const STATUS_INTERVAL_MS = 10000;
const METRICS_INTERVAL_MS = 3000;

const LAYOUT_PRESETS = [
    { id: 'auto', label: 'Auto' },
    { id: '1', label: '1', cols: 1, rows: 1 },
    { id: '4', label: '4', cols: 2, rows: 2 },
    { id: '9', label: '9', cols: 3, rows: 3 },
    { id: '16', label: '16', cols: 4, rows: 4 },
    { id: '32', label: '32', cols: 8, rows: 4 },
    { id: '64', label: '64', cols: 8, rows: 8 }
];

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

function autoGridShape(count) {
    if (count <= 1) return { columns: 1, rows: 1 };
    const width = window.innerWidth || 1920;
    const height = window.innerHeight || 1080;
    const isPortrait = height > width;
    if (count === 2) return isPortrait ? { columns: 1, rows: 2 } : { columns: 2, rows: 1 };
    if (isPortrait) {
        const rows = Math.ceil(Math.sqrt(count));
        return { rows, columns: Math.ceil(count / rows) };
    }
    const columns = Math.ceil(Math.sqrt(count));
    return { columns, rows: Math.ceil(count / columns) };
}

async function request(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(payload?.error?.message ?? `${path} -> ${response.status}`);
        error.status = response.status;
        throw error;
    }
    return payload;
}

function createStatusBar(onLayoutChange, onDisplaySelect) {
    const endpoint = el('span', { className: 'statusbar__ip', textContent: 'localhost' });
    const channels = el('span', { className: 'statusbar__value', textContent: '0' });
    const recording = el('span', { className: 'statusbar__value', textContent: '0' });
    const cpu = el('span', { className: 'statusbar__value', textContent: '--' });
    const ram = el('span', { className: 'statusbar__value', textContent: '--' });
    const gpu = el('span', { className: 'statusbar__value', textContent: '--' });
    const displayInfo = el('span', { className: 'statusbar__value', textContent: '--' });
    const version = el('span', { className: 'statusbar__value', textContent: '--' });
    const clock = el('span', { className: 'statusbar__clock', textContent: '--:--:--' });

    let activeLayout = 'auto';

    const layoutButtons = LAYOUT_PRESETS.map((preset) => {
        const btn = el('button', {
            type: 'button',
            className: `wall-layout-btn ${preset.id === activeLayout ? 'wall-layout-btn--active' : ''}`,
            textContent: preset.label,
            title: `Visualizza griglia ${preset.label}`,
            onclick: () => {
                activeLayout = preset.id;
                for (const b of layoutButtons) b.classList.toggle('wall-layout-btn--active', b === btn);
                onLayoutChange(preset);
            }
        });
        return btn;
    });

    const layoutBar = el('div', { className: 'wall-layout-bar' }, layoutButtons);

    const item = (label, value) => el('span', { className: 'statusbar__item' }, [
        el('span', { className: 'statusbar__label', textContent: label }),
        value
    ]);

    const element = el('footer', { className: 'statusbar' }, [
        el('span', { className: 'statusbar__brand' }, [
            el('span', { className: 'statusbar__mark' }, [icon('shield')]),
            el('span', { textContent: 'ARGUS-PR' })
        ]),
        item('IP Server', endpoint),
        item('Griglia', layoutBar),
        item('Canali', channels),
        item('REC', recording),
        el('span', { className: 'statusbar__spacer' }),
        item('Uscita', displayInfo),
        item('CPU', cpu),
        item('RAM', ram),
        item('GPU', gpu),
        item('Versione', version),
        clock
    ]);

    const tick = () => { clock.textContent = new Date().toLocaleTimeString(); };
    tick();
    setInterval(tick, 1000);

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
                const connected = status.displays.filter((d) => d.connected);
                displayInfo.textContent = connected.length > 0
                    ? connected.map((d) => d.label).join(', ')
                    : `${status.displays.length} uscite (nessun display)`;
            }
            paintMetrics(status.metrics);
        }
    };
}

function createGrid() {
    const element = el('div', { className: 'console__grid' });
    let players = [];
    let signature = null;
    let cameraList = [];
    let spotlightCameraId = null;
    let selectedLayout = LAYOUT_PRESETS[0];

    const teardown = () => {
        for (const player of players) player.destroy();
        players = [];
    };

    const updateShape = () => {
        if (spotlightCameraId) {
            element.style.setProperty('grid-template-columns', '1fr');
            element.style.setProperty('grid-template-rows', '1fr');
            return;
        }

        if (selectedLayout.id === 'auto') {
            const count = cameraList.length || 1;
            const shape = autoGridShape(count);
            element.style.setProperty('grid-template-columns', `repeat(${shape.columns}, 1fr)`);
            element.style.setProperty('grid-template-rows', `repeat(${shape.rows}, 1fr)`);
        } else {
            element.style.setProperty('grid-template-columns', `repeat(${selectedLayout.cols}, 1fr)`);
            element.style.setProperty('grid-template-rows', `repeat(${selectedLayout.rows}, 1fr)`);
        }
    };

    window.addEventListener('resize', updateShape);

    const single = (node) => {
        element.style.setProperty('grid-template-columns', '1fr');
        element.style.setProperty('grid-template-rows', '1fr');
        element.replaceChildren(node);
    };

    const toggleSpotlight = (cameraId) => {
        spotlightCameraId = spotlightCameraId === cameraId ? null : cameraId;
        buildDom();
    };

    const buildDom = () => {
        teardown();
        updateShape();

        let visibleCameras = cameraList;
        if (spotlightCameraId) {
            visibleCameras = cameraList.filter((c) => c.id === spotlightCameraId);
            if (visibleCameras.length === 0) {
                spotlightCameraId = null;
                visibleCameras = cameraList;
            }
        } else if (selectedLayout.id !== 'auto') {
            const max = selectedLayout.cols * selectedLayout.rows;
            visibleCameras = cameraList.slice(0, max);
        }

        element.replaceChildren(...visibleCameras.map((camera) => {
            const video = el('video', { autoplay: 'autoplay', playsinline: 'playsinline' });
            video.muted = true;

            const state = el('span', { className: 'console__state' });
            const isSpotlight = spotlightCameraId === camera.id;

            const zoomBtn = el('button', {
                type: 'button',
                className: `console__tool-btn ${isSpotlight ? 'console__tool-btn--active' : ''}`,
                textContent: isSpotlight ? 'Griglia' : 'Zoom',
                title: isSpotlight ? 'Torna alla griglia' : 'Espandi a schermo intero (doppio clic)',
                onclick: (e) => {
                    e.stopPropagation();
                    toggleSpotlight(camera.id);
                }
            });

            const tools = el('div', { className: 'console__tools' }, [zoomBtn]);

            const cell = el('div', {
                className: `console__cell ${isSpotlight ? 'console__cell--spotlight' : ''}`,
                ondblclick: () => toggleSpotlight(camera.id)
            }, [
                video,
                el('span', { className: 'console__tag' }, [
                    state,
                    el('span', { textContent: camera.name })
                ]),
                tools
            ]);

            if (isPlaybackSupported()) {
                players.push(createLivePlayer(video, camera.id, {
                    onState: (value) => {
                        const suffix = value === 'live' ? ' console__state--live' : (value === 'unsupported' ? ' console__state--down' : '');
                        state.className = `console__state${suffix}`;
                    }
                }));
            }

            return cell;
        }));
    };

    return {
        element,
        setLayout(preset) {
            selectedLayout = preset;
            spotlightCameraId = null;
            buildDom();
        },
        message(text) {
            signature = null;
            cameraList = [];
            spotlightCameraId = null;
            teardown();
            single(el('div', { className: 'console__empty', textContent: text }));
        },
        render(cameras) {
            cameraList = cameras;
            const next = cameras.map((camera) => `${camera.id}:${camera.name}`).join('|');
            if (next === signature) return;
            signature = next;
            buildDom();
        }
    };
}

async function boot() {
    const root = document.getElementById('console');
    const grid = createGrid();
    const bar = createStatusBar((layout) => grid.setLayout(layout));

    root.replaceChildren(grid.element, bar.element);

    let authenticated = false;

    const refresh = async () => {
        const status = await request('/api/console/status');
        bar.update(status);

        if (status.setupRequired) {
            authenticated = false;
            grid.message(`Configurazione iniziale non completata.\nApri ${bar.webUrl} da un altro dispositivo per creare l'account amministratore.`);
            return;
        }

        if (!authenticated) {
            const current = await request('/api/auth/session').catch(() => null);
            if (current?.username) {
                authenticated = true;
            } else {
                const sessionRes = await request('/api/console/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}'
                }).catch(() => null);
                if (sessionRes) {
                    authenticated = true;
                } else {
                    grid.message(`Accesso richiesto.\nEffettua prima il login su ${bar.webUrl} per visualizzare il Muro Video.`);
                    return;
                }
            }
        }

        const { cameras } = await request('/api/cameras');
        const active = cameras.filter((camera) => camera.enabled);

        if (active.length === 0) {
            grid.message(`Nessuna telecamera attiva.\nApri ${bar.webUrl} da un altro dispositivo per aggiungerne una.`);
            return;
        }

        grid.render(active);
    };

    const safeRefresh = () => refresh().catch((error) => {
        if (error.status === 401) authenticated = false;
        grid.message(`Console non disponibile: ${error.message}`);
    });

    const safeMetrics = () => request('/api/console/status')
        .then((status) => bar.update(status))
        .catch(() => {});

    await safeRefresh();
    setInterval(safeRefresh, STATUS_INTERVAL_MS);
    setInterval(safeMetrics, METRICS_INTERVAL_MS);
}

boot().catch((error) => {
    document.getElementById('console').replaceChildren(
        el('div', { className: 'console__empty', textContent: `Console non disponibile: ${error.message}` })
    );
});
