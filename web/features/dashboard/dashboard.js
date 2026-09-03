import { el, formatDuration } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { MACRO_AREAS } from './hub_registry.js';

function renderBadge(badge) {
    if (!badge) return null;
    const tone = badge.tone ?? 'blue';
    return el('span', { className: `badge badge--${tone}`, textContent: badge.text });
}

function subAppTile(subapp, permissions) {
    if (subapp.permission && !permissions.includes(subapp.permission)) {
        return null;
    }

    const tone = subapp.badge?.tone ?? 'blue';
    const tile = el('button', {
        type: 'button',
        className: 'hub-tile',
        title: subapp.title,
        onclick: () => {
            if (subapp.isPage) {
                window.open(`/${subapp.route}`, '_blank');
            } else {
                location.hash = `#/${subapp.route}`;
            }
        }
    }, [
        el('div', { className: 'hub-tile__left' }, [
            el('div', { className: `hub-tile__icon-wrap hub-tile__icon-wrap--${tone}` }, [
                icon(subapp.icon ?? 'apps')
            ]),
            el('span', { className: 'hub-tile__title', textContent: subapp.title })
        ]),
        el('div', { className: 'hub-tile__right' }, [
            renderBadge(subapp.badge),
            el('span', { className: 'hub-tile__arrow' }, [icon('chevronRight')])
        ])
    ]);

    tile.dataset.search = subapp.title.toLowerCase();
    return tile;
}

function macroAreaCard(area, info, permissions) {
    const tiles = area.subapps
        .map((s) => subAppTile(s, permissions))
        .filter(Boolean);

    if (tiles.length === 0) return null;

    const metricText = area.getMetric ? area.getMetric(info) : '';
    const color = area.color ?? 'blue';

    const card = el('section', {
        className: `hub-card hub-card--${color} rise`,
        'data-area': area.id
    }, [
        el('div', { className: 'hub-card__header' }, [
            el('div', { className: 'hub-card__brand' }, [
                el('div', { className: `hub-card__icon-badge hub-card__icon-badge--${color}` }, [
                    icon(area.icon ?? 'apps')
                ]),
                el('h2', { className: 'hub-card__title', textContent: area.title })
            ]),
            metricText ? el('span', { className: 'hub-card__metric', textContent: metricText }) : null
        ]),
        el('div', { className: 'hub-card__tiles' }, tiles)
    ]);

    return card;
}

export async function renderDashboard({ session, api }) {
    const root = el('div', { className: 'view hub-view' });
    const permissions = session?.permissions ?? [];

    const info = await api.get('/api/system/info').catch(() => ({
        hostname: 'ARGUS-PR',
        platform: 'NVR',
        version: '0.15.0',
        uptimeSeconds: 0,
        cameraCount: 0
    }));

    const searchInput = el('input', {
        type: 'search',
        className: 'hub-search__input',
        placeholder: 'Cerca modulo o telecamera…'
    });

    const searchBox = el('div', { className: 'hub-search' }, [
        icon('search'),
        searchInput
    ]);

    const header = el('div', { className: 'hub-hero' }, [
        el('div', { className: 'hub-hero__info' }, [
            el('div', { className: 'hub-hero__headline' }, [
                el('h1', { className: 'hub-hero__title', textContent: 'Centro di Controllo' }),
                el('span', { className: 'hub-hero__status-pill' }, [
                    el('span', { className: 'status-dot status-dot--live' }),
                    'Sistema Operativo'
                ])
            ]),
            el('div', { className: 'hub-hero__meta-row' }, [
                el('span', { className: 'hub-hero__meta-chip', textContent: `Host: ${info.hostname}` }),
                el('span', { className: 'hub-hero__meta-chip', textContent: `${info.cameraCount ?? 0} Canali Attivi` }),
                el('span', { className: 'hub-hero__meta-chip', textContent: `v${info.version}` }),
                el('span', { className: 'hub-hero__meta-chip', textContent: `Uptime ${formatDuration(info.uptimeSeconds)}` })
            ])
        ]),
        searchBox
    ]);

    const cardsGrid = el('div', { className: 'hub-grid' });
    for (const area of MACRO_AREAS) {
        const node = macroAreaCard(area, info, permissions);
        if (node) cardsGrid.append(node);
    }

    searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        for (const card of cardsGrid.querySelectorAll('.hub-card')) {
            let hasMatch = false;
            for (const tile of card.querySelectorAll('.hub-tile')) {
                const s = tile.dataset.search ?? '';
                const match = q.length === 0 || s.includes(q);
                tile.hidden = !match;
                if (match) hasMatch = true;
            }
            card.hidden = !hasMatch;
        }
    });

    root.replaceChildren(header, cardsGrid);
    return root;
}
