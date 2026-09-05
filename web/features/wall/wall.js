import { createLivePlayer, isPlaybackSupported } from '/features/live/player.js';
import { createStatusBar, presetById } from './wall_statusbar.js';
import { connectWallEvents } from './wall_live.js';
import { createBootScreen } from './wall_boot.js';
import { createOverlay } from './wall_overlay.js';

const STATUS_INTERVAL_MS = 10000;
const METRICS_INTERVAL_MS = 3000;
const CONFIG_INTERVAL_MS = 30000;

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

function createGrid() {
    const element = el('div', { className: 'console__grid' });
    const overlays = new Map();
    let players = [];
    let overlaySettings = null;
    let signature = null;
    let cameraList = [];
    let spotlightCameraId = null;
    let selectedLayout = presetById('auto');

    const teardown = () => {
        for (const player of players) player.destroy();
        for (const overlay of overlays.values()) overlay.destroy();
        players = [];
        overlays.clear();
    };

    const updateShape = () => {
        if (spotlightCameraId || selectedLayout.id === '1') {
            element.style.setProperty('grid-template-columns', '1fr');
            element.style.setProperty('grid-template-rows', '1fr');
            return;
        }

        if (selectedLayout.id === 'auto') {
            const shape = autoGridShape(cameraList.length || 1);
            element.style.setProperty('grid-template-columns', `repeat(${shape.columns}, 1fr)`);
            element.style.setProperty('grid-template-rows', `repeat(${shape.rows}, 1fr)`);
            return;
        }

        element.style.setProperty('grid-template-columns', `repeat(${selectedLayout.cols}, 1fr)`);
        element.style.setProperty('grid-template-rows', `repeat(${selectedLayout.rows}, 1fr)`);
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

    const buildCell = (camera) => {
        const video = el('video', { autoplay: 'autoplay', playsinline: 'playsinline' });
        video.muted = true;

        const state = el('span', { className: 'console__state' });
        const isSpotlight = spotlightCameraId === camera.id;
        const overlay = createOverlay(video);
        overlay.configure(overlaySettings);
        overlays.set(camera.id, overlay);

        const zoomButton = el('button', {
            type: 'button',
            className: `console__tool-btn ${isSpotlight ? 'console__tool-btn--active' : ''}`,
            textContent: isSpotlight ? 'Griglia' : 'Zoom',
            title: isSpotlight ? 'Torna alla griglia' : 'Espandi a schermo intero (doppio clic)',
            onclick: (event) => {
                event.stopPropagation();
                toggleSpotlight(camera.id);
            }
        });

        const cell = el('div', {
            className: `console__cell ${isSpotlight ? 'console__cell--spotlight' : ''}`,
            ondblclick: () => toggleSpotlight(camera.id)
        }, [
            video,
            overlay.element,
            el('span', { className: 'console__tag' }, [
                state,
                el('span', { textContent: camera.name }),
                el('span', {
                    className: `console__quality console__quality--${camera.quality}`,
                    textContent: camera.quality === 'main' ? 'HD' : 'SD'
                })
            ]),
            el('div', { className: 'console__tools' }, [zoomButton])
        ]);

        if (isPlaybackSupported()) {
            players.push(createLivePlayer(video, camera.id, {
                quality: camera.quality,
                onState: (value) => {
                    const suffix = value === 'live' ? ' console__state--live' : (value === 'unsupported' ? ' console__state--down' : '');
                    state.className = `console__state${suffix}`;
                }
            }));
        }

        return cell;
    };

    const buildDom = () => {
        teardown();
        updateShape();

        let visible = cameraList;
        if (spotlightCameraId) {
            visible = cameraList.filter((camera) => camera.id === spotlightCameraId);
            if (visible.length === 0) {
                spotlightCameraId = null;
                visible = cameraList;
            }
        } else if (selectedLayout.id !== 'auto') {
            visible = cameraList.slice(0, selectedLayout.cols * selectedLayout.rows);
        }

        element.replaceChildren(...visible.map(buildCell));
    };

    return {
        element,
        setOverlay(settings) {
            overlaySettings = settings;
            for (const overlay of overlays.values()) overlay.configure(settings);
        },
        applyVision(payload) {
            overlays.get(payload.cameraId)?.apply(payload);
        },
        setLayout(preset) {
            if (preset.id === selectedLayout.id) return;
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
            const next = cameras.map((camera) => `${camera.index}:${camera.id}:${camera.name}:${camera.quality}`).join('|');
            cameraList = cameras;
            if (next === signature) return;
            signature = next;
            buildDom();
        }
    };
}

async function boot() {
    const root = document.getElementById('console');
    const grid = createGrid();
    const bar = createStatusBar((preset) => grid.setLayout(preset));
    const boot = createBootScreen();

    root.replaceChildren(grid.element, bar.element, boot.element);

    let authenticated = false;
    let plan = [];
    let revision = null;
    let serverVersion = null;
    let reloading = false;

    const reloadForNewVersion = (version) => {
        if (reloading) return;
        reloading = true;
        boot.show('ready', { currentVersion: version });
        setTimeout(() => location.reload(), 1800);
    };

    const trackVersion = (status) => {
        const phase = status.update?.phase ?? 'idle';

        if (serverVersion === null) {
            serverVersion = status.version;
        } else if (status.version !== serverVersion) {
            reloadForNewVersion(status.version);
            return true;
        }

        if (phase === 'requested' || phase === 'pending') {
            const showing = plan.length > 0;

            boot.show(phase, {
                currentVersion: status.version,
                targetRef: status.update.targetRef,
                attempts: status.update.attempts,
                maxAttempts: status.update.maxAttempts,
                since: status.uptimeSeconds,
                compact: showing
            });

            return !showing;
        }

        boot.hide();
        return false;
    };

    const applyConfig = async () => {
        const payload = await request('/api/wall/config').catch(() => null);
        if (!payload) return;

        plan = payload.plan ?? [];

        if (payload.revision !== revision) {
            revision = payload.revision;
            bar.setClock(payload.config.clock, payload.timezone ?? null);
            grid.setOverlay(payload.config.overlay);
            bar.setLayout(payload.config.layout);
            grid.setLayout(presetById(payload.config.layout));

            const enabledOutputs = (payload.config.outputs ?? []).filter((output) => output.enabled).map((output) => output.id);
            bar.setOutputs(enabledOutputs);
        }

        if (plan.length > 0) grid.render(plan);
    };

    const refresh = async () => {
        const status = await request('/api/console/status');
        bar.update(status);

        if (trackVersion(status)) return;

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
                const issued = await request('/api/console/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}'
                }).catch(() => null);

                if (!issued) {
                    grid.message(`Accesso richiesto.\nEffettua prima il login su ${bar.webUrl} per visualizzare il Muro Video.`);
                    return;
                }
                authenticated = true;
            }
        }

        await applyConfig();

        if (plan.length === 0) {
            grid.message(`Nessuna telecamera assegnata al muro.\nApri ${bar.webUrl} e configura Regia & Layout Muro Video.`);
            return;
        }

        grid.render(plan);
    };

    const safeRefresh = () => refresh().catch((error) => {
        if (error.status === 401) {
            authenticated = false;
            boot.hide();
            grid.message(`Accesso richiesto.
Effettua il login su ${bar.webUrl} per visualizzare il Muro Video.`);
            return;
        }

        bar.setLink('offline');
        boot.show('reconnecting', { currentVersion: serverVersion, compact: plan.length > 0 });
    });

    const safeMetrics = () => request('/api/console/status')
        .then((status) => {
            bar.update(status);
            trackVersion(status);
        })
        .catch(() => boot.show('reconnecting', { currentVersion: serverVersion, compact: plan.length > 0 }));

    const safeConfig = () => {
        if (!authenticated) return;
        applyConfig().catch(() => {});
    };

    await safeRefresh();

    connectWallEvents(
        () => safeConfig(),
        (state) => bar.setLink(state),
        (payload) => grid.applyVision(payload)
    );

    setInterval(safeRefresh, STATUS_INTERVAL_MS);
    setInterval(safeMetrics, METRICS_INTERVAL_MS);
    setInterval(safeConfig, CONFIG_INTERVAL_MS);
}

boot().catch((error) => {
    document.getElementById('console').replaceChildren(
        el('div', { className: 'console__empty', textContent: `Console non disponibile: ${error.message}` })
    );
});
