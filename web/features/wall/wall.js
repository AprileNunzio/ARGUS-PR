import { createLivePlayer, isPlaybackSupported } from '/features/live/player.js';
import { icon } from '/assets/icons.js';

const STATUS_INTERVAL_MS = 10000;
const METRICS_INTERVAL_MS = 3000;

function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined) continue;
        if (key === 'className' || key === 'textContent') node[key] = value;
        else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) {
        if (child) node.append(child);
    }
    return node;
}

function gridShape(count) {
    if (count <= 1) return { columns: 1, rows: 1 };
    if (count === 2) return { columns: 2, rows: 1 };
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

function createStatusBar() {
    const endpoint = el('span', { className: 'statusbar__ip', textContent: 'localhost' });
    const channels = el('span', { className: 'statusbar__value', textContent: '0' });
    const recording = el('span', { className: 'statusbar__value', textContent: '0' });
    const cpu = el('span', { className: 'statusbar__value', textContent: '--' });
    const ram = el('span', { className: 'statusbar__value', textContent: '--' });
    const gpu = el('span', { className: 'statusbar__value', textContent: '--' });
    const version = el('span', { className: 'statusbar__value', textContent: '--' });
    const clock = el('span', { className: 'statusbar__clock', textContent: '--:--:--' });

    const item = (label, value) => el('span', { className: 'statusbar__item' }, [
        el('span', { className: 'statusbar__label', textContent: label }),
        value
    ]);

    const element = el('footer', { className: 'statusbar' }, [
        el('span', { className: 'statusbar__brand' }, [
            el('span', { className: 'statusbar__mark' }, [icon('shield')]),
            el('span', { textContent: 'ARGUS-PR' })
        ]),
        item('Web', endpoint),
        item('Canali', channels),
        item('REC', recording),
        el('span', { className: 'statusbar__spacer' }),
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
            version.textContent = status.version;
            paintMetrics(status.metrics);
        }
    };
}

function createGrid() {
    const element = el('div', { className: 'console__grid' });
    let players = [];
    let signature = null;

    const teardown = () => {
        for (const player of players) player.destroy();
        players = [];
    };

    const single = (node) => {
        element.style.setProperty('grid-template-columns', '1fr');
        element.style.setProperty('grid-template-rows', '1fr');
        element.replaceChildren(node);
    };

    return {
        element,
        message(text) {
            signature = null;
            teardown();
            single(el('div', { className: 'console__empty', textContent: text }));
        },
        render(cameras) {
            const next = cameras.map((camera) => `${camera.id}:${camera.name}`).join('|');
            if (next === signature) return;
            signature = next;
            teardown();

            const shape = gridShape(cameras.length);
            element.style.setProperty('grid-template-columns', `repeat(${shape.columns}, 1fr)`);
            element.style.setProperty('grid-template-rows', `repeat(${shape.rows}, 1fr)`);

            element.replaceChildren(...cameras.map((camera) => {
                const video = el('video', { autoplay: 'autoplay', playsinline: 'playsinline' });
                video.muted = true;

                const state = el('span', { className: 'console__state' });
                const cell = el('div', { className: 'console__cell' }, [
                    video,
                    el('span', { className: 'console__tag' }, [state, el('span', { textContent: camera.name })])
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
        }
    };
}

async function boot() {
    const root = document.getElementById('console');
    const bar = createStatusBar();
    const grid = createGrid();

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
            await request('/api/console/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
            });
            authenticated = true;
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
        .then((status) => bar.metrics(status.metrics))
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
