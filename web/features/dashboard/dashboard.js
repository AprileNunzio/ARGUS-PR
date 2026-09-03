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

export async function renderDashboard({ session, api }) {
    const root = el('div', { className: 'view launchpad-view' });
    const permissions = session?.permissions ?? [];

    const info = await api.get('/api/system/info').catch(() => ({
        hostname: 'ARGUS-PR',
        platform: 'NVR',
        version: '0.15.0',
        uptimeSeconds: 0,
        cameraCount: 0
    }));

    let currentAreaId = null;
    let viewAllMode = false;
    let searchQuery = '';

    const searchInput = el('input', {
        type: 'search',
        className: 'launchpad-search__input',
        placeholder: 'Cerca applicazione o strumento…'
    });

    const searchBox = el('div', { className: 'launchpad-search' }, [
        icon('search'),
        searchInput
    ]);

    const modeCategoryBtn = el('button', {
        type: 'button',
        className: 'seg__btn seg__btn--on',
        textContent: 'Categorie',
        onclick: () => {
            viewAllMode = false;
            currentAreaId = null;
            updateModeBtns();
            renderGrid();
        }
    });

    const modeAllBtn = el('button', {
        type: 'button',
        className: 'seg__btn',
        textContent: 'Tutte le App',
        onclick: () => {
            viewAllMode = true;
            currentAreaId = null;
            updateModeBtns();
            renderGrid();
        }
    });

    const updateModeBtns = () => {
        modeCategoryBtn.classList.toggle('seg__btn--on', !viewAllMode && !currentAreaId);
        modeAllBtn.classList.toggle('seg__btn--on', viewAllMode);
    };

    const header = el('div', { className: 'launchpad-hero' }, [
        el('div', { className: 'launchpad-hero__info' }, [
            el('div', { className: 'launchpad-hero__headline' }, [
                el('h1', { className: 'launchpad-hero__title', textContent: 'Centro di Controllo' }),
                el('span', { className: 'launchpad-hero__status-pill' }, [
                    el('span', { className: 'status-dot status-dot--live' }),
                    'Sistema Operativo'
                ])
            ]),
            el('div', { className: 'launchpad-hero__meta-row' }, [
                el('span', { className: 'launchpad-hero__meta-chip', textContent: `Host: ${info.hostname}` }),
                el('span', { className: 'launchpad-hero__meta-chip', textContent: `${info.cameraCount ?? 0} Canali` }),
                el('span', { className: 'launchpad-hero__meta-chip', textContent: `v${info.version}` }),
                el('span', { className: 'launchpad-hero__meta-chip', textContent: `Uptime ${formatDuration(info.uptimeSeconds)}` })
            ])
        ]),
        el('div', { className: 'launchpad-hero__actions' }, [
            el('div', { className: 'seg-group' }, [modeCategoryBtn, modeAllBtn]),
            searchBox
        ])
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
        renderGrid();
    });

    renderGrid();
    root.replaceChildren(header, navBarHost, gridHost);
    return root;
}
