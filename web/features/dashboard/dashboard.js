import { el, formatDuration } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { MACRO_AREAS } from './hub_registry.js';

function renderBadge(badge) {
    if (!badge) return null;
    const tone = badge.tone ?? 'blue';
    return el('span', { className: `badge badge--${tone}`, textContent: badge.text });
}

function renderCardIcon(pngName, fallbackSvg, color = 'blue') {
    const wrap = el('div', { className: `launchpad-card__icon-wrap launchpad-card__icon-wrap--${color}` });
    const fallbackNode = icon(fallbackSvg ?? 'apps');
    fallbackNode.classList.add('launchpad-card__icon-svg');

    if (pngName) {
        const img = el('img', {
            className: 'launchpad-card__icon-img',
            src: `/assets/icons/${pngName}.png`,
            alt: pngName
        });
        img.onerror = () => {
            img.replaceWith(fallbackNode);
        };
        wrap.append(img);
    } else {
        wrap.append(fallbackNode);
    }

    return wrap;
}

function launchpadCard({ pngName, iconName, title, desc, tagNode, color = 'blue', onClick }) {
    const card = el('button', {
        type: 'button',
        className: `launchpad-card launchpad-card--${color} rise`,
        onclick: onClick
    }, [
        renderCardIcon(pngName, iconName, color),
        el('h3', { className: 'launchpad-card__title', textContent: title }),
        el('p', { className: 'launchpad-card__desc', textContent: desc }),
        el('div', { className: 'launchpad-card__footer' }, [tagNode])
    ]);
    return card;
}

export async function renderDashboard({ session, api, params = [] }) {
    const root = el('div', { className: 'view launchpad-view' });
    const permissions = session?.permissions ?? [];

    let info = await api.get('/api/system/info').catch(() => ({
        hostname: 'ARGUS-PR',
        platform: 'NVR',
        version: '0.15.0',
        uptimeSeconds: 0,
        cameraCount: 0
    }));

    const initialArea = (params[0] === 'area' && params[1]) ? params[1] : null;
    let currentAreaId = initialArea;
    let viewAllMode = false;
    let searchQuery = '';

    const searchInput = el('input', {
        type: 'search',
        className: 'launchpad-search__input',
        placeholder: 'Cerca applicazione o strumento…'
    });

    const clearSearchBtn = el('button', {
        type: 'button',
        className: 'launchpad-search__clear',
        title: 'Cancella ricerca',
        onclick: () => {
            searchInput.value = '';
            searchQuery = '';
            clearSearchBtn.hidden = true;
            renderGrid();
            searchInput.focus();
        }
    }, [icon('close')]);
    clearSearchBtn.hidden = true;

    const kbdBadge = el('kbd', {
        className: 'launchpad-search__kbd',
        textContent: 'Ctrl K'
    });

    const searchBox = el('div', { className: 'launchpad-search' }, [
        icon('search'),
        searchInput,
        clearSearchBtn,
        kbdBadge
    ]);

    const modeCategoryBtn = el('button', {
        type: 'button',
        className: 'seg__btn seg__btn--on',
        onclick: () => {
            viewAllMode = false;
            currentAreaId = null;
            updateModeBtns();
            renderGrid();
        }
    }, [
        icon('grid'),
        el('span', { textContent: 'Categorie' })
    ]);

    const modeAllBtn = el('button', {
        type: 'button',
        className: 'seg__btn',
        onclick: () => {
            viewAllMode = true;
            currentAreaId = null;
            updateModeBtns();
            renderGrid();
        }
    }, [
        icon('apps'),
        el('span', { textContent: 'Tutte le App' })
    ]);

    const updateModeBtns = () => {
        modeCategoryBtn.classList.toggle('seg__btn--on', !viewAllMode && !currentAreaId);
        modeAllBtn.classList.toggle('seg__btn--on', viewAllMode);
    };
    updateModeBtns();

    const wallBtn = el('button', {
        type: 'button',
        className: 'launchpad-tool-btn',
        title: 'Apri il Muro Video a schermo intero',
        onclick: () => window.open('/wall', '_blank')
    }, [
        icon('monitor'),
        el('span', { className: 'launchpad-tool-btn__text', textContent: 'Muro Video' })
    ]);

    const refreshBtn = el('button', {
        type: 'button',
        className: 'launchpad-tool-btn launchpad-tool-btn--icon',
        title: 'Aggiorna stato e telemetria',
        onclick: async () => {
            refreshBtn.classList.add('spinning');
            info = await api.get('/api/system/info').catch(() => info);
            updateMetaChips();
            setTimeout(() => refreshBtn.classList.remove('spinning'), 400);
        }
    }, [icon('refresh')]);

    const settingsBtn = permissions.includes('system.manage') ? el('button', {
        type: 'button',
        className: 'launchpad-tool-btn launchpad-tool-btn--icon',
        title: 'Impostazioni di sistema',
        onclick: () => { location.hash = '#/settings'; }
    }, [icon('settings')]) : null;

    const camerasChip = el('a', {
        href: '#/cameras',
        className: 'launchpad-hero__meta-chip clickable',
        title: 'Gestione Telecamere'
    }, [
        icon('camera'),
        el('span', { className: 'cameras-text', textContent: `${info.cameraCount ?? 0} Canali` })
    ]);

    const uptimeChip = el('span', {
        className: 'launchpad-hero__meta-chip',
        title: `Nodo: ${info.hostname}`
    }, [
        icon('clock'),
        el('span', { className: 'uptime-text', textContent: formatDuration(info.uptimeSeconds) })
    ]);

    const versionChip = el('span', {
        className: 'launchpad-hero__meta-chip'
    }, [
        `v${info.version}`
    ]);

    const updateMetaChips = () => {
        const cText = camerasChip.querySelector('.cameras-text');
        if (cText) cText.textContent = `${info.cameraCount ?? 0} Canali`;
        const uText = uptimeChip.querySelector('.uptime-text');
        if (uText) uText.textContent = formatDuration(info.uptimeSeconds);
    };

    const header = el('div', { className: 'launchpad-hero' }, [
        el('div', { className: 'launchpad-hero__left' }, [
            el('div', { className: 'launchpad-hero__brand' }, [
                el('div', { className: 'launchpad-hero__logo' }, [icon('shield')]),
                el('h1', { className: 'launchpad-hero__title', textContent: 'Centro di Controllo' }),
                el('span', { className: 'launchpad-hero__status-pill', title: 'Tutti i demoni e worker operativi' }, [
                    el('span', { className: 'status-dot status-dot--live' }),
                    'Operativo'
                ])
            ]),
            el('div', { className: 'launchpad-hero__meta-group' }, [
                camerasChip,
                uptimeChip,
                versionChip
            ])
        ]),
        el('div', { className: 'launchpad-hero__center' }, [
            searchBox
        ]),
        el('div', { className: 'launchpad-hero__right' }, [
            el('div', { className: 'seg-group' }, [modeCategoryBtn, modeAllBtn]),
            wallBtn,
            refreshBtn,
            settingsBtn
        ].filter(Boolean))
    ]);

    const navBarHost = el('div', { className: 'launchpad-navbar' });
    const gridHost = el('div', { className: 'launchpad-grid' });

    const openSubapp = (subapp) => {
        if (subapp.isPage) {
            window.open(`/${subapp.route}`, '_blank');
        } else {
            location.hash = `#/${subapp.route}`;
        }
    };

    const renderGrid = () => {
        gridHost.replaceChildren();
        navBarHost.replaceChildren();

        const q = searchQuery.trim().toLowerCase();

        if (q.length > 0) {
            navBarHost.append(
                el('div', { className: 'launchpad-nav-title' }, [
                    icon('search'),
                    el('span', { textContent: `Risultati di ricerca per "${searchQuery}"` })
                ])
            );

            let matchesCount = 0;
            for (const area of MACRO_AREAS) {
                for (const sub of area.subapps) {
                    if (sub.permission && !permissions.includes(sub.permission)) continue;
                    const match = `${sub.title} ${sub.desc} ${area.title}`.toLowerCase().includes(q);
                    if (match) {
                        matchesCount++;
                        gridHost.append(launchpadCard({
                            pngName: sub.png,
                            iconName: sub.icon,
                            title: sub.title,
                            desc: sub.desc,
                            tagNode: renderBadge(sub.badge),
                            color: area.color,
                            onClick: () => openSubapp(sub)
                        }));
                    }
                }
            }

            if (matchesCount === 0) {
                gridHost.append(el('div', { className: 'launchpad-empty' }, [
                    icon('search'),
                    el('p', { textContent: 'Nessuna applicazione trovata' })
                ]));
            }
            return;
        }

        if (viewAllMode) {
            for (const area of MACRO_AREAS) {
                for (const sub of area.subapps) {
                    if (sub.permission && !permissions.includes(sub.permission)) continue;
                    gridHost.append(launchpadCard({
                        pngName: sub.png,
                        iconName: sub.icon,
                        title: sub.title,
                        desc: sub.desc,
                        tagNode: renderBadge(sub.badge),
                        color: area.color,
                        onClick: () => openSubapp(sub)
                    }));
                }
            }
            return;
        }

        if (currentAreaId) {
            const area = MACRO_AREAS.find((a) => a.id === currentAreaId);
            if (!area) {
                currentAreaId = null;
                renderGrid();
                return;
            }

            const backBtn = el('button', {
                type: 'button',
                className: 'launchpad-back-btn',
                onclick: () => {
                    currentAreaId = null;
                    updateModeBtns();
                    renderGrid();
                }
            }, [
                icon('chevronLeft'),
                el('span', { textContent: 'Tutte le categorie' })
            ]);

            const areaInfo = el('div', { className: 'launchpad-nav-title' }, [
                el('span', { className: `badge badge--${area.color}`, textContent: area.title }),
                el('span', { className: 'muted text-sm', textContent: `${area.subapps.length} applicazioni` })
            ]);

            navBarHost.append(backBtn, areaInfo);

            for (const sub of area.subapps) {
                if (sub.permission && !permissions.includes(sub.permission)) continue;
                gridHost.append(launchpadCard({
                    pngName: sub.png,
                    iconName: sub.icon,
                    title: sub.title,
                    desc: sub.desc,
                    tagNode: renderBadge(sub.badge),
                    color: area.color,
                    onClick: () => openSubapp(sub)
                }));
            }
            return;
        }

        for (const area of MACRO_AREAS) {
            const availableSubs = area.subapps.filter((s) => !s.permission || permissions.includes(s.permission));
            if (availableSubs.length === 0) continue;

            gridHost.append(launchpadCard({
                pngName: area.png,
                iconName: area.icon,
                title: area.title,
                desc: area.desc,
                tagNode: el('span', { className: 'launchpad-card__chip', textContent: `${availableSubs.length} strumenti` }),
                color: area.color,
                onClick: () => {
                    currentAreaId = area.id;
                    updateModeBtns();
                    renderGrid();
                }
            }));
        }
    };

    searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value;
        clearSearchBtn.hidden = searchQuery.length === 0;
        renderGrid();
    });

    const onKeyDown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
    };
    window.addEventListener('keydown', onKeyDown);

    renderGrid();
    root.replaceChildren(header, navBarHost, gridHost);
    return root;
}
