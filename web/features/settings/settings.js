import { el, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { controlFor, isVisible } from './controls.js';

function pendingBanner(status, actions) {
    if (status?.phase !== 'awaiting-approval' || !status.targetRef) return null;

    const opensAt = status.message?.includes('finestra')
        ? el('span', { className: 'muted', textContent: status.message })
        : null;

    return el('section', { className: 'panel panel--accent rise' }, [
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title' }, [icon('download'), `Aggiornamento ${status.targetRef} pronto`]),
            opensAt
        ]),
        el('p', { className: 'panel__text', textContent: 'Il riavvio interrompe la registrazione per qualche secondo. Se la nuova versione non parte, viene ripristinata da sola quella precedente.' }),
        el('div', { className: 'row row--end' }, [
            el('button', { className: 'btn', type: 'button', textContent: 'Rimanda', onclick: actions.postpone }),
            el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Riavvia e aggiorna ora', onclick: actions.approve })
        ])
    ]);
}

function renderBadge(badge) {
    if (!badge) return null;
    const tone = badge.tone ?? 'blue';
    return el('span', {
        className: `badge badge--${tone}`,
        textContent: badge.text
    });
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

function renderSection(sectionDef, entries, values, onChange) {
    const rows = entries.map((entry) => settingRow(entry, values, onChange));

    return el('div', { className: 'settings-section', 'data-section': sectionDef.id }, [
        el('div', { className: 'settings-section__head' }, [
            icon(sectionDef.icon ?? 'sliders'),
            el('span', { className: 'settings-section__title', textContent: sectionDef.label })
        ]),
        el('div', { className: 'settings-section__rows' }, rows)
    ]);
}

function groupCard(group, entries, values, onChange) {
    const sectionsDef = group.sections ?? [{ id: 'default', label: 'Parametri', icon: 'sliders' }];
    const sectionNodes = [];

    for (const sec of sectionsDef) {
        const matchingEntries = entries.filter((e) => (e.section ?? 'default') === sec.id);
        if (matchingEntries.length > 0) {
            sectionNodes.push(renderSection(sec, matchingEntries, values, onChange));
        }
    }

    const unassigned = entries.filter((e) => !sectionsDef.some((s) => s.id === (e.section ?? 'default')));
    if (unassigned.length > 0) {
        sectionNodes.push(renderSection({ id: 'other', label: 'Opzioni Aggiuntive', icon: 'sliders' }, unassigned, values, onChange));
    }

    const color = group.color ?? 'blue';
    const card = el('section', {
        className: `settings-card settings-card--${color} rise`,
        'data-group': group.id
    }, [
        el('div', { className: 'settings-card__header' }, [
            el('div', { className: 'settings-card__brand' }, [
                el('div', { className: `settings-card__icon-badge settings-card__icon-badge--${color}` }, [
                    icon(group.icon ?? 'settings')
                ]),
                el('h2', { className: 'settings-card__title', textContent: group.label })
            ]),
            el('span', { className: 'settings-card__count', textContent: `${entries.length} parametri` })
        ]),
        el('div', { className: 'settings-card__body' }, sectionNodes)
    ]);

    return card;
}

export async function renderSettings({ api }) {
    const root = el('div', { className: 'view settings-view' });

    const rerender = async () => {
        const [payload, updates] = await Promise.all([
            api.get('/api/settings'),
            api.get('/api/updates/status').catch(() => null)
        ]);

        const groups = payload.groups ?? [];
        const settings = payload.settings ?? [];
        const values = Object.fromEntries(settings.map((entry) => [entry.key, entry.value]));
        const draft = {};
        let activeTab = 'all';

        const saveBtn = el('button', {
            className: 'btn btn--primary btn--save',
            type: 'button',
            textContent: 'Salva modifiche'
        });

        const cancelBtn = el('button', {
            className: 'btn btn--ghost',
            type: 'button',
            textContent: 'Annulla'
        });

        const changeCountBadge = el('span', { className: 'floating-save__count', textContent: '0 modifiche' });
        const saveFeedback = el('span', { className: 'floating-save__msg' });

        const floatingBar = el('div', { className: 'floating-save-bar' }, [
            el('div', { className: 'floating-save__info' }, [
                icon('warning'),
                changeCountBadge,
                saveFeedback
            ]),
            el('div', { className: 'row' }, [
                cancelBtn,
                saveBtn
            ])
        ]);

        const updateFloatingBar = () => {
            const count = Object.keys(draft).length;
            changeCountBadge.textContent = `${count} modifiche non salvate`;
            if (count > 0) {
                floatingBar.classList.add('floating-save-bar--visible');
            } else {
                floatingBar.classList.remove('floating-save-bar--visible');
            }
        };

        const onChange = (key, value) => {
            draft[key] = value;
            values[key] = value;
            saveFeedback.textContent = '';
            updateFloatingBar();

            for (const node of root.querySelectorAll('[data-depends]')) {
                const dependency = JSON.parse(node.dataset.depends);
                node.hidden = values[dependency.key] !== dependency.value;
            }
        };

        cancelBtn.addEventListener('click', () => {
            rerender();
        });

        saveBtn.addEventListener('click', async () => {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Salvataggio…';

            try {
                await api.put('/api/settings', draft);
                saveFeedback.textContent = 'Impostazioni salvate con successo.';
                setTimeout(() => rerender(), 800);
            } catch (error) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Salva modifiche';
                saveFeedback.textContent = `Errore: ${error.message}`;
            }
        });

        const actions = {
            approve: async () => {
                await api.post('/api/updates/approve').catch((error) => {
                    saveFeedback.textContent = `Errore: ${error.message}`;
                });
            },
            postpone: async () => {
                await api.post('/api/updates/postpone').catch(() => {});
                await rerender();
            }
        };

        const banner = pendingBanner(updates, actions);

        const searchInput = el('input', {
            type: 'search',
            className: 'settings-search__input',
            placeholder: 'Cerca per nome, chiave o descrizione…'
        });

        const searchBox = el('div', { className: 'settings-search' }, [
            icon('search'),
            searchInput
        ]);

        const tabsContainer = el('div', { className: 'settings-tabs' });
        const allTab = el('button', {
            type: 'button',
            className: 'settings-tab settings-tab--active'
        }, [
            icon('grid'),
            el('span', { textContent: 'Tutte' }),
            el('span', { className: 'settings-tab__badge', textContent: String(settings.length) })
        ]);

        allTab.addEventListener('click', () => {
            activeTab = 'all';
            updateTabStates();
            filterVisible();
        });
        tabsContainer.append(allTab);

        const tabButtons = new Map([['all', allTab]]);

        for (const g of groups) {
            const count = settings.filter((s) => s.group === g.id).length;
            const tabBtn = el('button', {
                type: 'button',
                className: `settings-tab settings-tab--${g.color ?? 'blue'}`
            }, [
                icon(g.icon ?? 'settings'),
                el('span', { textContent: g.label }),
                el('span', { className: 'settings-tab__badge', textContent: String(count) })
            ]);

            tabBtn.addEventListener('click', () => {
                activeTab = g.id;
                updateTabStates();
                filterVisible();
            });

            tabsContainer.append(tabBtn);
            tabButtons.set(g.id, tabBtn);
        }

        const updateTabStates = () => {
            for (const [id, btn] of tabButtons.entries()) {
                if (id === activeTab) btn.classList.add('settings-tab--active');
                else btn.classList.remove('settings-tab--active');
            }
        };

        const cardsContainer = el('div', { className: 'settings-cards-grid' });
        for (const g of groups) {
            const entries = settings.filter((s) => s.group === g.id);
            if (entries.length > 0) {
                cardsContainer.append(groupCard(g, entries, values, onChange));
            }
        }

        const filterVisible = () => {
            const query = searchInput.value.trim().toLowerCase();

            for (const card of cardsContainer.querySelectorAll('.settings-card')) {
                const groupId = card.dataset.group;
                const matchesTab = activeTab === 'all' || activeTab === groupId;

                if (!matchesTab) {
                    card.hidden = true;
                    continue;
                }

                let cardHasMatches = false;
                for (const row of card.querySelectorAll('.settings-row')) {
                    const rowSearch = row.dataset.search ?? '';
                    const matchesSearch = query.length === 0 || rowSearch.includes(query);

                    if (row.dataset.depends) {
                        const dep = JSON.parse(row.dataset.depends);
                        const depMet = values[dep.key] === dep.value;
                        row.hidden = !depMet || !matchesSearch;
                    } else {
                        row.hidden = !matchesSearch;
                    }

                    if (!row.hidden) cardHasMatches = true;
                }

                card.hidden = !cardHasMatches;
            }
        };

        searchInput.addEventListener('input', () => {
            filterVisible();
        });

        root.replaceChildren(
            el('div', { className: 'settings-header' }, [
                el('h1', { className: 'view__title', textContent: 'Impostazioni' }),
                searchBox
            ]),
            tabsContainer,
            banner,
            cardsContainer,
            floatingBar
        );
    };

    await rerender();
    return root;
}
