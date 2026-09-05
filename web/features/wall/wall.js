import { createLivePlayer, isPlaybackSupported } from '/features/live/player.js';
import { createStatusBar, presetById } from './wall_statusbar.js';
import { connectWallEvents } from './wall_live.js';
import { createBootScreen } from './wall_boot.js';
import { createOverlay } from './wall_overlay.js';
import { createToolbar } from './wall_tools.js';
import { icon } from '/assets/icons.js';

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
    const qualityOverrides = new Map();
    let players = [];
    let overlaySettings = null;
    let tileSettings = null;
    let notify = () => {};
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
            const reserved = cameraList.reduce((top, camera) => Math.max(top, Number(camera.index) + 1 || 0), 0);
            const shape = autoGridShape(Math.max(cameraList.length, reserved) || 1);
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

    const buildCell = (source) => {
        const camera = { ...source, quality: qualityOverrides.get(source.id) ?? source.quality };

        const video = el('video', { autoplay: 'autoplay', playsinline: 'playsinline' });
        video.muted = true;

        const parts = tileSettings ?? {};

        const state = el('span', { className: 'console__state' });
        state.hidden = parts.state === false;

        const isSpotlight = spotlightCameraId === camera.id;
        const overlay = createOverlay(video);
        overlay.configure(overlaySettings);
        overlays.set(camera.id, overlay);

        const badge = el('span', {
            className: `console__quality console__quality--${camera.quality}`,
            textContent: camera.quality === 'main' ? 'HD' : 'SD'
        });
        badge.hidden = parts.quality === false;

        const label = el('span', { textContent: camera.name });
        label.hidden = parts.name === false;

        const tag = el('span', { className: 'console__tag' }, [state, label, badge]);
        tag.hidden = parts.name === false && parts.state === false && parts.quality === false;

        let livePlayer = null;

        const attachLive = (quality) => {
            livePlayer?.destroy();
            video.removeAttribute('src');
            video.load();

            if (!isPlaybackSupported()) return;

            livePlayer = createLivePlayer(video, camera.id, {
                quality,
                onState: (value) => {
                    const suffix = value === 'live' ? ' console__state--live' : (value === 'unsupported' ? ' console__state--down' : '');
                    state.className = `console__state${suffix}`;
                    state.hidden = parts.state === false;
                }
            });

            players.push(livePlayer);
        };

        const bannerText = el('span', { className: 'console__playback-text', textContent: 'Riproduzione registrata' });

        const banner = el('div', { className: 'console__playback', hidden: 'hidden' }, [
            icon('timeline'),
            bannerText,
            el('button', {
                type: 'button',
                className: 'console__tool-btn',
                onclick: (event) => {
                    event.stopPropagation();
                    banner.hidden = true;
                    attachLive(camera.quality);
                }
            }, [icon('play'), el('span', { className: 'console__tool-label', textContent: 'Torna in diretta' })])
        ]);

        const toolbar = createToolbar({
            camera,
            video,
            isSpotlight,
            onNotice: (text) => notify(text),
            onSpotlight: () => toggleSpotlight(camera.id),
            onRestart: () => attachLive(camera.quality),
            onQuality: (quality) => {
                qualityOverrides.set(camera.id, quality);
                signature = null;
                buildDom();
            },
            onPlayback: (segment) => {
                livePlayer?.destroy();
                livePlayer = null;
                video.src = `/api/archive/${encodeURIComponent(camera.id)}/media?file=${encodeURIComponent(segment.file)}`;
                video.play().catch(() => undefined);
                bannerText.textContent = `Registrazione delle ${new Date(segment.startedAt).toLocaleTimeString('it-IT')}`;
                banner.hidden = false;
            }
        });

        toolbar.element.hidden = parts.tools === false;

        const cell = el('div', {
            className: `console__cell ${isSpotlight ? 'console__cell--spotlight' : ''}`,
            ondblclick: () => toggleSpotlight(camera.id)
        }, [video, overlay.element, tag, banner, toolbar.ptzPad, toolbar.element]);

        attachLive(camera.quality);

        return cell;
    };

    const buildPlaceholder = (index) => el('div', { className: 'console__cell console__cell--empty' }, tileSettings?.placeholder === false ? [] : [
        el('div', { className: 'console__brand' }, [
            el('span', { className: 'console__brand-mark' }, [
                el('span', { className: 'console__brand-glyph', textContent: 'A' })
            ]),
            el('span', { className: 'console__brand-name', textContent: 'ARGUS-PR' }),
            el('span', { className: 'console__brand-by', textContent: 'by NunzioTech' }),
            el('span', { className: 'console__brand-slot', textContent: `Riquadro ${index + 1} · libero` })
        ])
    ]);

    const buildDom = () => {
        teardown();
        updateShape();

        if (spotlightCameraId) {
            const focused = cameraList.filter((camera) => camera.id === spotlightCameraId);
            if (focused.length > 0) {
                element.replaceChildren(...focused.map(buildCell));
                return;
            }
            spotlightCameraId = null;
        }

        const highest = cameraList.reduce((top, camera) => Math.max(top, Number(camera.index) || 0), -1);
        const slots = selectedLayout.id === 'auto'
            ? Math.max(cameraList.length, highest + 1)
            : selectedLayout.cols * selectedLayout.rows;

        const seats = new Map();
        const overflow = [];

        for (const camera of cameraList) {
            const seat = Number(camera.index);
            if (Number.isInteger(seat) && seat >= 0 && seat < slots && !seats.has(seat)) seats.set(seat, camera);
            else overflow.push(camera);
        }

        let cursor = 0;
        for (const camera of overflow) {
            while (cursor < slots && seats.has(cursor)) cursor += 1;
            if (cursor >= slots) break;
            seats.set(cursor, camera);
        }

        const cells = [];
        for (let index = 0; index < slots; index += 1) {
            const camera = seats.get(index);
            cells.push(camera ? buildCell(camera) : buildPlaceholder(index));
        }

        element.replaceChildren(...cells);
    };

    return {
        element,
        setOverlay(settings) {
            overlaySettings = settings;
            for (const overlay of overlays.values()) overlay.configure(settings);
        },
        setTileParts(parts) {
            const changed = JSON.stringify(parts) !== JSON.stringify(tileSettings);
            tileSettings = parts;
            if (changed) {
                signature = null;
                buildDom();
            }
        },
        onNotice(handler) {
            notify = handler;
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

    const toast = el('div', { className: 'wall-toast', hidden: 'hidden' });
    let toastTimer = null;

    grid.onNotice((text) => {
        toast.textContent = text;
        toast.hidden = false;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
    });

    root.replaceChildren(grid.element, bar.element, boot.element, toast);

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

    const screenId = new URLSearchParams(location.search).get('screen');

    const applyConfig = async () => {
        const query = screenId ? `?screen=${encodeURIComponent(screenId)}` : '';
        const payload = await request(`/api/wall/config${query}`).catch(() => null);
        if (!payload) return;

        plan = payload.plan ?? [];

        if (payload.revision !== revision) {
            revision = payload.revision;
            bar.setClock(payload.config.clock, payload.timezone ?? null);
            grid.setOverlay(payload.config.overlay);
            grid.setTileParts(payload.config.tile);
            bar.setParts(payload.config.statusbar);
            bar.setLayout(payload.screen.layout);
            grid.setLayout(presetById(payload.screen.layout));

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
