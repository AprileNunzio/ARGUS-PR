import { el, chip, notice, confirmPanel, pageHead } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { controlFor } from '/features/settings/controls.js';

const PHASE_LABELS = {
    idle: ['In attesa di istruzioni', 'info'],
    requested: ['Aggiornamento richiesto (riavvio in corso)', 'warn'],
    pending: ['In fase di prova / stabilizzazione', 'warn'],
    healthy: ['Sistema aggiornato e stabile', 'ok'],
    'rolled-back': ['Ripristinato a versione precedente', 'bad'],
    failed: ['Aggiornamento fallito', 'bad']
};

function phaseBadge(phase) {
    const [label, variant] = PHASE_LABELS[phase] ?? [phase, 'info'];
    return chip(label, variant);
}

function releaseNotes(text) {
    const lines = String(text ?? '')
        .split('\n')
        .map((l) => l.replace(/^#{1,6}\s*/, '').replace(/^[-*]\s*/, '').replace(/[`*_]/g, '').trim())
        .filter((l) => l.length > 0 && !l.startsWith('```'))
        .slice(0, 10);

    if (lines.length === 0) return null;
    return el('ul', { className: 'stack stack--tight' }, lines.map((line) => el('li', { className: 'section__hint', textContent: line })));
}

export async function renderUpdatesView({ api }) {
    const root = el('div', { className: 'view updates-view' });

    let status = await api.get('/api/updates/status').catch((err) => ({ failure: err }));
    let settingsValues = await api.get('/api/settings').catch(() => ({}));

    const confirmContainer = el('div', {});
    const feedbackContainer = el('div', {});

    const refreshData = async () => {
        status = await api.get('/api/updates/status').catch((err) => ({ failure: err }));
        settingsValues = await api.get('/api/settings').catch(() => ({}));
        render();
    };

    const render = () => {
        if (status.failure) {
            root.replaceChildren(
                pageHead({ title: 'Aggiornamenti e Manutenzione', hint: 'Gestione ciclo di vita software e aggiornamenti OTA' }),
                notice('error', `Impossibile caricare lo stato degli aggiornamenti: ${status.failure.message}`)
            );
            return;
        }

        const latest = status.lastCheck?.latest ?? null;
        const available = status.lastCheck?.updateAvailable === true;

        const checkBtn = el('button', {
            className: 'btn',
            type: 'button',
            onclick: async () => {
                checkBtn.disabled = true;
                checkBtn.textContent = 'Verifica in corso…';
                try {
                    await api.post('/api/updates/check');
                    feedbackContainer.replaceChildren(notice('ok', 'Controllo completato con successo.'));
                } catch (e) {
                    feedbackContainer.replaceChildren(notice('error', `Errore durante la verifica: ${e.message}`));
                }
                await refreshData();
            }
        }, [icon('refresh'), el('span', { textContent: 'Verifica Nuove Versioni' })]);

        const approveBtn = status.phase === 'pending'
            ? el('button', {
                className: 'btn btn--primary',
                type: 'button',
                onclick: async () => {
                    approveBtn.disabled = true;
                    try {
                        await api.post('/api/updates/approve');
                        feedbackContainer.replaceChildren(notice('ok', 'Riavvio approvato. Ricarica la pagina a riavvio avvenuto.'));
                        await refreshData();
                    } catch (e) {
                        feedbackContainer.replaceChildren(notice('error', e.message));
                        approveBtn.disabled = false;
                    }
                }
            }, [icon('check'), el('span', { textContent: 'Approva Riavvio' })])
            : null;

        const cancelBtn = (status.phase === 'requested' || status.phase === 'pending')
            ? el('button', {
                className: 'btn btn--danger',
                type: 'button',
                onclick: async () => {
                    cancelBtn.disabled = true;
                    try {
                        await api.post('/api/updates/cancel');
                        feedbackContainer.replaceChildren(notice('info', 'Aggiornamento annullato.'));
                        await refreshData();
                    } catch (e) {
                        feedbackContainer.replaceChildren(notice('error', e.message));
                        cancelBtn.disabled = false;
                    }
                }
            }, [icon('close'), el('span', { textContent: 'Annulla Aggiornamento' })])
            : null;

        const applyBtn = (available && latest && status.supported && status.phase === 'idle')
            ? el('button', {
                className: 'btn btn--primary',
                type: 'button',
                onclick: () => {
                    confirmContainer.replaceChildren(confirmPanel({
                        title: `Installare versione ${latest.tag}?`,
                        message: `Il servizio verra riavviato automaticamente. In caso di anomalia entro 90 secondi, verra eseguito il ripristino automatico a ${status.currentVersion}.`,
                        confirmLabel: 'Installa e Riavvia Ora',
                        onCancel: () => confirmContainer.replaceChildren(),
                        onConfirm: async () => {
                            try {
                                await api.post('/api/updates/apply', { ref: latest.tag });
                                confirmContainer.replaceChildren();
                                feedbackContainer.replaceChildren(
                                    notice('warn', `Aggiornamento alla versione ${latest.tag} inviato! Il servizio si sta riavviando. Ricarica tra 30-60 secondi.`)
                                );
                                await refreshData();
                            } catch (e) {
                                confirmContainer.replaceChildren(notice('error', e.message));
                            }
                        }
                    }));
                }
            }, [icon('download'), el('span', { textContent: `Installa ${latest.tag} Subito` })])
            : null;

        const headerActions = [checkBtn, approveBtn, cancelBtn, applyBtn].filter(Boolean);

        const head = pageHead({
            title: 'Aggiornamenti & Manutenzione',
            hint: 'Gestione delle versioni, auto-upgrade OTA, watchdog di ripristino e finestre temporali',
            actions: headerActions
        });

        let releaseHint = 'Allineato all ultima release';
        if (available) {
            releaseHint = 'Nuova versione pronta per l installazione';
        } else if (latest?.tag) {
            const cleanCur = String(status.currentVersion ?? '').replace(/^v/, '');
            const cleanLat = String(latest.tag ?? '').replace(/^v/, '');
            if (cleanCur !== cleanLat) {
                releaseHint = `Versione installata (v${cleanCur}) piu recente di GitHub (${latest.tag})`;
            }
        }

        const statusCards = el('div', { className: 'grid grid--stats rise rise-1' }, [
            el('div', { className: 'stat' }, [
                el('span', { className: 'stat__icon' }, [icon('server', { className: 'icon--lg' })]),
                el('div', { className: 'stat__body' }, [
                    el('span', { className: 'stat__value', textContent: `v${status.currentVersion}` }),
                    el('span', { className: 'stat__label', textContent: 'Versione Installata' }),
                    el('span', { className: 'stat__hint', textContent: status.supported ? 'Git / OTA Supportato' : 'Installazione Manuale' })
                ])
            ]),
            el('div', { className: 'stat' }, [
                el('span', { className: 'stat__icon' }, [icon('download', { className: 'icon--lg' })]),
                el('div', { className: 'stat__body' }, [
                    el('span', { className: 'stat__value', textContent: latest ? latest.tag : 'Verifica…' }),
                    el('span', { className: 'stat__label', textContent: 'Ultima Release Disponibile' }),
                    el('span', { className: 'stat__hint', textContent: releaseHint })
                ])
            ]),
            el('div', { className: 'stat' }, [
                el('span', { className: 'stat__icon' }, [icon('activity', { className: 'icon--lg' })]),
                el('div', { className: 'stat__body' }, [
                    el('span', { className: 'stat__value', textContent: status.phase.toUpperCase() }),
                    el('span', { className: 'stat__label', textContent: 'Fase Attuale' }),
                    el('span', { className: 'stat__hint', textContent: `Tentativi di avvio: ${status.attempts ?? 0}/3` })
                ])
            ]),
            el('div', { className: 'stat' }, [
                el('span', { className: 'stat__icon' }, [icon('shield', { className: 'icon--lg' })]),
                el('div', { className: 'stat__body' }, [
                    el('span', { className: 'stat__value', textContent: status.quarantine ? 'QUARANTENA' : 'ATTIVO' }),
                    el('span', { className: 'stat__label', textContent: 'Protezione Watchdog' }),
                    el('span', { className: 'stat__hint', textContent: status.quarantine ? `Bloccato: ${status.quarantine}` : 'Rollback automatico pronto' })
                ])
            ])
        ]);

        const releaseCard = el('section', { className: 'panel rise rise-2' }, [
            el('div', { className: 'panel__head' }, [
                el('span', { className: 'panel__title' }, [icon('info'), 'Dettagli Ultima Release']),
                latest ? chip(latest.tag, available ? 'info' : 'ok') : chip('Non verificato', 'warn')
            ]),
            el('div', { className: 'panel__body stack' }, [
                latest ? el('div', { className: 'stack stack--tight' }, [
                    el('strong', { textContent: latest.name || latest.tag }),
                    latest.publishedAt ? el('span', { className: 'section__hint', textContent: `Data pubblicazione: ${new Date(latest.publishedAt).toLocaleString()}` }) : null,
                    releaseNotes(latest.notes),
                    latest.url ? el('a', {
                        className: 'section__hint',
                        href: latest.url,
                        target: '_blank',
                        rel: 'noreferrer noopener',
                        textContent: 'Visualizza rilascio e sorgenti completi su GitHub →'
                    }) : null
                ]) : el('div', { className: 'section__hint', textContent: 'Clicca su "Verifica Nuove Versioni" per consultare le note di rilascio ufficiali.' })
            ])
        ]);

        const settingsCard = renderSettingsSection(api, settingsValues, () => refreshData());

        root.replaceChildren(
            head,
            feedbackContainer,
            confirmContainer,
            statusCards,
            releaseCard,
            settingsCard
        );
    };

    render();
    return root;
}

function renderSettingsSection(api, values, onSaved) {
    const panel = el('section', { className: 'panel rise rise-3' });
    const localDraft = { ...values };
    const saveFeedback = el('span', { className: 'section__hint' });

    const saveBtn = el('button', {
        className: 'btn btn--primary btn--sm',
        type: 'button',
        onclick: async () => {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Salvataggio…';
            try {
                await api.put('/api/settings', localDraft);
                saveFeedback.textContent = 'Politiche salvate con successo.';
                setTimeout(() => {
                    saveFeedback.textContent = '';
                    onSaved();
                }, 1000);
            } catch (e) {
                saveFeedback.textContent = `Errore: ${e.message}`;
                saveBtn.disabled = false;
                saveBtn.textContent = 'Salva Politiche';
            }
        }
    }, [icon('check'), el('span', { textContent: 'Salva Politiche' })]);

    const autoCheckRow = el('div', { className: 'settings-row' }, [
        el('div', { className: 'settings-row__info' }, [
            el('span', { className: 'settings-row__label', textContent: 'Cerca aggiornamenti automaticamente' }),
            el('span', { className: 'section__hint', textContent: 'Controlla nuove versioni su GitHub periodicamente in background' })
        ]),
        el('div', { className: 'settings-row__control' }, [
            controlFor({
                type: 'boolean',
                value: localDraft['updates.autoCheck'] ?? true
            }, (val) => { localDraft['updates.autoCheck'] = val; })
        ])
    ]);

    const policyRow = el('div', { className: 'settings-row' }, [
        el('div', { className: 'settings-row__info' }, [
            el('span', { className: 'settings-row__label', textContent: 'Modalita e politica di riavvio' }),
            el('span', { className: 'section__hint', textContent: 'Conferma: richiede OK manuale. Finestra: riavvia solo negli orari programmati. Subito: aggiorna all istante.' })
        ]),
        el('div', { className: 'settings-row__control' }, [
            controlFor({
                type: 'enum',
                value: localDraft['updates.restartPolicy'] ?? 'ask',
                options: [
                    { value: 'ask', label: 'Chiedi Conferma' },
                    { value: 'window', label: 'Finestra Oraria' },
                    { value: 'immediate', label: 'Immediato' }
                ]
            }, (val) => {
                localDraft['updates.restartPolicy'] = val;
                windowDaysRow.hidden = val !== 'window';
                windowHoursRow.hidden = val !== 'window';
            })
        ])
    ]);

    const isWindow = (localDraft['updates.restartPolicy'] ?? 'ask') === 'window';

    const windowDaysRow = el('div', { className: 'settings-row' }, [
        el('div', { className: 'settings-row__info' }, [
            el('span', { className: 'settings-row__label', textContent: 'Giorni consentiti per manutenzione' }),
            el('span', { className: 'section__hint', textContent: 'Giorni della settimana in cui e ammesso il riavvio per upgrade' })
        ]),
        el('div', { className: 'settings-row__control' }, [
            controlFor({
                type: 'days',
                value: localDraft['updates.windowDays'] ?? [0, 1, 2, 3, 4, 5, 6]
            }, (val) => { localDraft['updates.windowDays'] = val; })
        ])
    ]);
    windowDaysRow.hidden = !isWindow;

    const windowHoursRow = el('div', { className: 'settings-row' }, [
        el('div', { className: 'settings-row__info' }, [
            el('span', { className: 'settings-row__label', textContent: 'Orario inizio e fine finestra' }),
            el('span', { className: 'section__hint', textContent: 'Fascia notturna o a basso traffico (es. 03:00 - 05:00)' })
        ]),
        el('div', { className: 'settings-row__control row row--tight' }, [
            controlFor({
                type: 'time',
                value: localDraft['updates.windowStart'] ?? '03:00'
            }, (val) => { localDraft['updates.windowStart'] = val; }),
            el('span', { textContent: '→' }),
            controlFor({
                type: 'time',
                value: localDraft['updates.windowEnd'] ?? '05:00'
            }, (val) => { localDraft['updates.windowEnd'] = val; })
        ])
    ]);
    windowHoursRow.hidden = !isWindow;

    panel.replaceChildren(
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title' }, [icon('settings'), 'Politiche di Installazione e Finestre di Manutenzione']),
            saveBtn
        ]),
        el('div', { className: 'panel__body stack' }, [
            autoCheckRow,
            policyRow,
            windowDaysRow,
            windowHoursRow
        ]),
        el('div', { className: 'panel__foot' }, [
            saveFeedback,
            saveBtn
        ])
    );

    return panel;
}
