import { el, chip, formatBytes, formatDuration } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { renderUpdatesPanel } from './updates_panel.js';
import { renderPerformancePanel } from './performance_panel.js';

function statCard(config, delay) {
    const card = el('div', { className: `stat rise rise-${delay}` }, [
        el('span', { className: 'stat__icon' }, [icon(config.icon, { className: 'icon--lg' })]),
        el('div', { className: 'stat__body' }, [
            el('span', { className: 'stat__value', textContent: config.value }),
            el('span', { className: 'stat__label', textContent: config.label }),
            config.hint ? el('span', { className: 'stat__hint', textContent: config.hint }) : null
        ])
    ]);
    card.style.setProperty('--stat-color', config.color);
    return card;
}

function spec(key, value) {
    return el('div', { className: 'spec' }, [
        el('span', { className: 'spec__k', textContent: key }),
        el('span', { className: 'spec__v truncate', textContent: value })
    ]);
}

export async function renderSystem({ api }) {
    const outlet = el('div', { className: 'view' });
    const updates = renderUpdatesPanel({ api });
    const performance = renderPerformancePanel({ api });
    const info = await api.get('/api/system/info');
    const disk = info.storage.mediaDisk;

    outlet.replaceChildren(
        el('div', { className: 'view__head' }, [
            el('h1', { className: 'view__title', textContent: 'Sistema' }),
            chip(`v${info.version}`, 'info')
        ]),

        el('div', { className: 'grid grid--stats' }, [
            statCard({ icon: 'cpu', label: 'Processore', value: String(info.cpus), hint: 'core disponibili', color: 'var(--violet)' }, 1),
            statCard({ icon: 'memory', label: 'Memoria libera', value: formatBytes(info.freeMemoryBytes), hint: `su ${formatBytes(info.totalMemoryBytes)}`, color: 'var(--accent)' }, 2),
            statCard({
                icon: 'disk',
                label: 'Spazio registrazioni',
                value: disk ? formatBytes(disk.freeBytes) : '--',
                hint: disk ? `${disk.usedPercent}% occupato` : 'non rilevabile',
                color: 'var(--amber)'
            }, 3),
            statCard({ icon: 'activity', label: 'Attivo da', value: formatDuration(info.uptimeSeconds), hint: 'senza interruzioni', color: 'var(--emerald)' }, 4)
        ]),

        performance.element,
        updates.element,


        el('section', { className: 'panel rise rise-5' }, [
            el('div', { className: 'panel__head' }, [
                el('span', { className: 'panel__title' }, [icon('server'), 'Installazione'])
            ]),
            el('div', { className: 'spec-grid' }, [
                spec('Node.js', info.node),
                spec('Telecamere', String(info.cameraCount)),
                spec('Dati', info.storage.dataDir),
                spec('Registrazioni', info.storage.mediaDir),
                spec('Motore video', info.media?.ffmpegVersion ?? 'non rilevato'),
                spec('Percorso ffmpeg', info.media?.ffmpegPath ?? '--')
            ])
        ])
    );

    await updates.refresh();
    return outlet;
}
