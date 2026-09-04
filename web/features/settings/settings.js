import { el, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { controlFor, isVisible } from './controls.js';

const GROUP_META = {
    access: { subtitle: 'Esposizione su internet, reti fidate LAN e proxy', icon: 'globe', color: 'cyan' },
    security: { subtitle: 'MFA TOTP, blocco account anti-bruteforce e durata sessioni', icon: 'shield', color: 'amber' },
    console: { subtitle: 'Console HDMI/Muro Video, layout griglie e uscite display', icon: 'monitor', color: 'rose' },
    retention: { subtitle: 'Spazio minimo su disco, quote e ritenzione automatica', icon: 'clock', color: 'emerald' },
    vision: { subtitle: 'Sensibilita modelli AI, tracciamento e soglie di inferenza', icon: 'eye', color: 'purple' }
};

function renderBadge(badge) {
    if (!badge) return null;
    return el('span', { className: `badge badge--${badge.tone ?? 'blue'}`, textContent: badge.text });
}

function settingRow(entry, values, onChange) {
    const badges = [];
    if (entry.badge) badges.push(renderBadge(entry.badge));
    if (entry.sensitive) badges.push(el('span', { className: 'badge badge--amber', textContent: 'Sensibile' }));

    const row = el('div', { className: 'settings-row' }, [
        el('div', { className: 'settings-row__info' }, [
            el('div', { className: 'settings-row__title-line' }, [
                el('span', { className: 'settings-row__label', textContent: entry.label, title: entry.help ?? entry.label }),
                ...badges
            ])
        ]),
        el('div', { className: 'settings-row__control' }, [
            controlFor(entry, (value) => onChange(entry.key, value))
        ])
    ]);

    row.dataset.key = entry.key;
    row.dataset.search = `${entry.label} ${entry.help ?? ''} ${entry.key}`.toLowerCase();
    if (entry.dependsOn) row.dataset.depends = JSON.stringify(entry.dependsOn);
    row.hidden = !isVisible(entry, values);
    return row;
}

function renderSubCard(sectionDef, entries, values, onChange) {
    const rows = entries.map((entry) => settingRow(entry, values, onChange));
    return el('div', { className: 'settings-subcard rise', 'data-section': sectionDef.id }, [
        el('div', { className: 'settings-subcard__head' }, [
            el('div', { className: 'settings-subcard__icon' }, [icon(sectionDef.icon ?? 'sliders')]),
            el('div', { className: 'settings-subcard__info' }, [
                el('h3', { className: 'settings-subcard__title', textContent: sectionDef.label }),
                el('span', { className: 'settings-subcard__count', textContent: `${entries.length} parametri` })
            ])
        ]),
        el('div', { className: 'settings-subcard__rows' }, rows)
    ]);
}

function renderMacroCategoryCard(group, entries, onSelect) {
    const meta = GROUP_META[group.id] ?? { subtitle: group.label, icon: group.icon ?? 'settings', color: group.color ?? 'blue' };
    const card = el('div', {
        className: `settings-cat-card settings-cat-card--${meta.color} rise`,
        onclick: () => onSelect(group.id)
    }, [
        el('div', { className: 'settings-cat-card__top' }, [
            el('div', { className: `settings-cat-card__icon settings-cat-card__icon--${meta.color}` }, [
                icon(meta.icon)
            ]),
            el('span', { className: 'settings-cat-card__count', textContent: `${entries.length} opzioni` })
        ]),
        el('div', { className: 'settings-cat-card__body' }, [
            el('h2', { className: 'settings-cat-card__title', textContent: group.label }),
            el('p', { className: 'settings-cat-card__subtitle', textContent: meta.subtitle })
        ]),
        el('div', { className: 'settings-cat-card__footer' }, [
            el('span', { className: 'settings-cat-card__action', textContent: 'Configura' }),
            icon('chevron-right')
        ])
    ]);
    return card;
}

export async function renderSettings({ api }) {
    const root = el('div', { className: 'view settings-view' });

    const payload = await api.get('/api/settings').catch((err) => {
        root.replaceChildren(el('div', { className: 'panel panel--bad' }, [
            notice('error', `Impossibile caricare le impostazioni: ${err.message}`)
        ]));
        return null;
    });

    if (!payload) return root;

    const groups = (payload.groups ?? []).filter((g) => g.id !== 'updates');
    const settings = (payload.settings ?? []).filter((s) => s.group !== 'updates');
    const values = Object.fromEntries(settings.map((entry) => [entry.key, entry.value]));
    const draft = {};

    let selectedGroupId = null;
    let viewMode = 'categories';
    let searchQuery = '';

    const saveBtn = el('button', { className: 'btn btn--primary btn--save', type: 'button', textContent: 'Salva modifiche' });
    const cancelBtn = el('button', { className: 'btn btn--ghost', type: 'button', textContent: 'Annulla' });
    const changeCountBadge = el('span', { className: 'floating-save__count', textContent: '0 modifiche' });
    const saveFeedback = el('span', { className: 'floating-save__msg' });

    const floatingBar = el('div', { className: 'floating-save-bar' }, [
        el('div', { className: 'floating-save__info' }, [
            icon('warning'),
            changeCountBadge,
            saveFeedback
        ]),
        el('div', { className: 'row' }, [cancelBtn, saveBtn])
    ]);

    const updateFloatingBar = () => {
        const count = Object.keys(draft).length;
        changeCountBadge.textContent = `${count} modifiche non salvate`;
        floatingBar.classList.toggle('floating-save-bar--visible', count > 0);
    };

    const onChange = (key, value) => {
        draft[key] = value;
        values[key] = value;
        saveFeedback.textContent = '';
        updateFloatingBar();

        for (const node of root.querySelectorAll('[data-depends]')) {
            const dep = JSON.parse(node.dataset.depends);
            node.hidden = values[dep.key] !== dep.value;
        }
    };

    cancelBtn.addEventListener('click', () => renderContent());

    saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvataggio…';
        try {
            await api.put('/api/settings', draft);
            saveFeedback.textContent = 'Impostazioni salvate con successo.';
            setTimeout(() => renderContent(), 800);
        } catch (error) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Salva modifiche';
            saveFeedback.textContent = `Errore: ${error.message}`;
        }
    });

    const renderContent = () => {
        const isDrillDown = selectedGroupId !== null && searchQuery.length === 0 && viewMode === 'categories';

        const searchInput = el('input', {
            type: 'search',
            className: 'settings-search__input',
            placeholder: 'Cerca parametro, chiave o descrizione…',
            value: searchQuery
        });

        const clearBtn = searchQuery.length > 0 ? el('button', {
            type: 'button',
            className: 'settings-search__clear',
            title: 'Cancella ricerca',
            onclick: () => {
                searchQuery = '';
                renderContent();
            }
        }, [icon('close')]) : null;

        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            renderContent();
        });

        const segCategories = el('button', {
            type: 'button',
            className: `seg__btn ${viewMode === 'categories' ? 'seg__btn--on' : ''}`,
            onclick: () => {
                viewMode = 'categories';
                selectedGroupId = null;
                renderContent();
            }
        }, [icon('grid'), el('span', { textContent: 'Categorie' })]);

        const segExpanded = el('button', {
            type: 'button',
            className: `seg__btn ${viewMode === 'expanded' ? 'seg__btn--on' : ''}`,
            onclick: () => {
                viewMode = 'expanded';
                renderContent();
            }
        }, [icon('apps'), el('span', { textContent: 'Tutte le opzioni' })]);

        const toolbar = el('div', { className: 'settings-toolbar' }, [
            el('div', { className: 'settings-toolbar__left' }, [
                el('div', { className: 'settings-toolbar__brand' }, [
                    el('div', { className: 'settings-toolbar__logo' }, [icon('settings')]),
                    el('h1', { className: 'settings-toolbar__title', textContent: 'Impostazioni' }),
                    el('span', { className: 'settings-toolbar__status' }, ['● Configurazione'])
                ])
            ]),
            el('div', { className: 'settings-toolbar__center' }, [
                el('div', { className: 'settings-search' }, [
                    icon('search'),
                    searchInput,
                    clearBtn
                ])
            ]),
            el('div', { className: 'settings-toolbar__right' }, [
                el('div', { className: 'seg-group' }, [segCategories, segExpanded])
            ])
        ]);

        let mainSection;

        if (isDrillDown) {
            const activeGroup = groups.find((g) => g.id === selectedGroupId) ?? groups[0];
            const meta = GROUP_META[activeGroup.id] ?? { subtitle: activeGroup.label, icon: 'settings', color: 'blue' };

            const backBtn = el('button', {
                type: 'button',
                className: 'settings-nav-back',
                onclick: () => {
                    selectedGroupId = null;
                    renderContent();
                }
            }, [icon('chevron-left'), el('span', { textContent: 'Tutte le sezioni' })]);

            const tabs = el('div', { className: 'settings-pills' }, groups.map((g) => {
                const isSelected = g.id === activeGroup.id;
                return el('button', {
                    type: 'button',
                    className: `settings-pill ${isSelected ? 'settings-pill--active' : ''}`,
                    onclick: () => {
                        selectedGroupId = g.id;
                        renderContent();
                    }
                }, [
                    icon(g.icon ?? 'settings'),
                    el('span', { textContent: g.label })
                ]);
            }));

            const navBar = el('div', { className: 'settings-nav' }, [
                backBtn,
                tabs
            ]);

            const entries = settings.filter((s) => s.group === activeGroup.id);
            const sectionsDef = activeGroup.sections ?? [{ id: 'default', label: 'Parametri', icon: 'sliders' }];
            const subCardsContainer = el('div', { className: 'settings-subcards-grid' });

            for (const sec of sectionsDef) {
                const matching = entries.filter((e) => (e.section ?? 'default') === sec.id);
                if (matching.length > 0) {
                    subCardsContainer.append(renderSubCard(sec, matching, values, onChange));
                }
            }

            const unassigned = entries.filter((e) => !sectionsDef.some((s) => s.id === (e.section ?? 'default')));
            if (unassigned.length > 0) {
                subCardsContainer.append(renderSubCard({ id: 'other', label: 'Opzioni Aggiuntive', icon: 'sliders' }, unassigned, values, onChange));
            }

            mainSection = el('div', { className: 'settings-drilldown' }, [
                navBar,
                subCardsContainer
            ]);
        } else if (searchQuery.length > 0 || viewMode === 'expanded') {
            const cardsContainer = el('div', { className: 'settings-subcards-grid' });
            let totalFound = 0;

            for (const g of groups) {
                const entries = settings.filter((s) => s.group === g.id);
                const matchingEntries = searchQuery.length === 0
                    ? entries
                    : entries.filter((e) => `${e.label} ${e.help ?? ''} ${e.key}`.toLowerCase().includes(searchQuery));

                if (matchingEntries.length > 0) {
                    totalFound += matchingEntries.length;
                    const meta = GROUP_META[g.id] ?? { icon: 'settings', color: 'blue' };
                    const groupBanner = el('div', { className: 'settings-group-banner' }, [
                        el('div', { className: `settings-group-banner__icon settings-group-banner__icon--${meta.color}` }, [icon(meta.icon)]),
                        el('h2', { className: 'settings-group-banner__title', textContent: g.label })
                    ]);
                    cardsContainer.append(groupBanner);

                    const sectionsDef = g.sections ?? [{ id: 'default', label: 'Parametri', icon: 'sliders' }];
                    for (const sec of sectionsDef) {
                        const secEntries = matchingEntries.filter((e) => (e.section ?? 'default') === sec.id);
                        if (secEntries.length > 0) {
                            cardsContainer.append(renderSubCard(sec, secEntries, values, onChange));
                        }
                    }
                }
            }

            if (totalFound === 0) {
                cardsContainer.append(el('div', { className: 'settings-empty' }, [
                    icon('search'),
                    el('p', { textContent: `Nessuna impostazione trovata per "${searchQuery}".` })
                ]));
            }

            mainSection = cardsContainer;
        } else {
            const grid = el('div', { className: 'settings-cats-grid' }, groups.map((g) => {
                const entries = settings.filter((s) => s.group === g.id);
                return renderMacroCategoryCard(g, entries, (id) => {
                    selectedGroupId = id;
                    renderContent();
                });
            }));
            mainSection = grid;
        }

        root.replaceChildren(
            toolbar,
            mainSection,
            floatingBar
        );
    };

    renderContent();
    return root;
}
