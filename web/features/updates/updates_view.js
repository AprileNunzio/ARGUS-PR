import { el, chip, notice, confirmPanel, pageHead } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, segmented, toggle, optionRow } from '/assets/ui.js';
import { controlFor } from '/features/settings/controls.js';
import { phaseBadge, versionState, watchdogState, statusTiles, releaseDetail } from './updates_panel.js';
import { offlineUpdateCard } from './offline_card.js';

const RESTART_OPTIONS = [
    { value: 'ask', label: 'Chiedi conferma', icon: 'info', hint: 'Il sistema segnala l aggiornamento e attende un comando esplicito' },
    { value: 'window', label: 'Finestra oraria', icon: 'clock', hint: 'Riavvia da solo soltanto negli orari indicati' },
    { value: 'immediate', label: 'Immediato', icon: 'zap', hint: 'Applica appena disponibile, interrompendo la registrazione per qualche secondo' }
];

function flatten(payload) {
    const values = {};
    for (const entry of payload?.settings ?? []) values[entry.key] = entry.value;
    return values;
}

export async function renderUpdatesView({ api }) {
    const root = el('div', { className: 'view updates-view' });
    const feedback = el('div', {});
    const confirmHost = el('div', {});

    let status = await api.get('/api/updates/status').catch((error) => ({ failure: error }));
    let settings = flatten(await api.get('/api/settings').catch(() => null));

    const refresh = async () => {
        status = await api.get('/api/updates/status').catch((error) => ({ failure: error }));
        settings = flatten(await api.get('/api/settings').catch(() => null));
        render();
    };

    const actionButton = (label, iconName, className, handler) => {
        const button = el('button', { className, type: 'button' }, [icon(iconName), el('span', { textContent: label })]);
        button.addEventListener('click', async () => {
            button.disabled = true;
            await handler(button);
            button.disabled = false;
        });
        return button;
    };

    const headerActions = () => {
        const check = actionButton('Verifica nuove versioni', 'refresh', 'btn', async () => {
            const result = await api.post('/api/updates/check').catch((error) => ({ failure: error }));
            feedback.replaceChildren(result.failure
                ? notice('error', `Errore durante la verifica: ${result.failure.message}`)
                : notice('ok', 'Controllo completato: stato allineato con GitHub.'));
            await refresh();
        });

        const actions = [check];

        if (status.phase === 'awaiting-approval' || status.phase === 'pending') {
            actions.push(actionButton('Approva riavvio', 'check', 'btn btn--primary', async () => {
                const result = await api.post('/api/updates/approve').catch((error) => ({ failure: error }));
                feedback.replaceChildren(result.failure
                    ? notice('error', result.failure.message)
                    : notice('warn', 'Riavvio approvato. Ricarica la pagina fra 30-60 secondi.'));
                await refresh();
            }));
        }

        if (status.phase === 'requested' || status.phase === 'pending' || status.phase === 'awaiting-approval') {
            actions.push(actionButton('Annulla aggiornamento', 'close', 'btn btn--danger', async () => {
                const endpoint = status.phase === 'awaiting-approval' ? '/api/updates/postpone' : '/api/updates/cancel';
                const result = await api.post(endpoint).catch((error) => ({ failure: error }));
                feedback.replaceChildren(result.failure
                    ? notice('error', result.failure.message)
                    : notice('info', 'Aggiornamento annullato.'));
                await refresh();
            }));
        }

        return actions;
    };

    const heroBanner = (version) => {
        const isUpToDate = version.tone === 'ok';
        const isAvailable = version.available;
        const toneClass = isUpToDate ? 'update-hero--ok' : (isAvailable ? 'update-hero--warn' : '');
        const iconTone = isUpToDate ? 'update-hero__icon--emerald' : (isAvailable ? 'update-hero__icon--amber' : 'update-hero__icon--blue');
        const iconName = isUpToDate ? 'check' : (isAvailable ? 'download' : 'server');

        return el('div', { className: `update-hero ${toneClass} rise` }, [
            el('div', { className: 'update-hero__body' }, [
                el('div', { className: `update-hero__icon ${iconTone}` }, [icon(iconName, { className: 'icon--lg' })]),
                el('div', { className: 'stack stack--tight' }, [
                    el('h2', { className: 'update-hero__title', textContent: version.headline }),
                    el('p', { className: 'update-hero__sub', textContent: version.detail })
                ])
            ]),
            el('div', { className: 'update-hero__actions' }, [
                phaseBadge(status.phase),
                chip(`v${status.currentVersion}`, 'info')
            ])
        ]);
    };

    const workflowSteps = () => {
        const p = status.phase;
        const s1 = (p === 'idle' || p === 'healthy') ? 'update-flow__step--done' : 'update-flow__step--active';
        const s2 = (p === 'requested' || p === 'pending') ? 'update-flow__step--active' : ((p === 'healthy') ? 'update-flow__step--done' : '');
        const s3 = p === 'pending' ? 'update-flow__step--active' : ((p === 'healthy') ? 'update-flow__step--done' : '');
        const s4 = p === 'healthy' ? 'update-flow__step--done' : '';

        return el('div', { className: 'update-flow rise' }, [
            el('div', { className: `update-flow__step ${s1}` }, [el('span', { className: 'update-flow__num', textContent: '1' }), el('span', { textContent: 'Verifica release' })]),
            el('div', { className: `update-flow__step ${s2}` }, [el('span', { className: 'update-flow__num', textContent: '2' }), el('span', { textContent: 'Download & Patch' })]),
            el('div', { className: `update-flow__step ${s3}` }, [el('span', { className: 'update-flow__num', textContent: '3' }), el('span', { textContent: 'Test 90s Watchdog' })]),
            el('div', { className: `update-flow__step ${s4}` }, [el('span', { className: 'update-flow__num', textContent: '4' }), el('span', { textContent: 'Stabile & Confermato' })])
        ]);
    };

    const installCard = (version) => {
        const latest = status.lastCheck?.latest ?? null;
        const canInstall = version.available && latest && status.supported && (status.phase === 'idle' || status.phase === 'healthy');

        const installButton = canInstall
            ? el('button', {
                className: 'btn btn--primary',
                type: 'button',
                onclick: () => {
                    confirmHost.replaceChildren(confirmPanel({
                        title: `Installare la versione ${latest.tag}?`,
                        message: `Il servizio verra aggiornato e riavviato in sicurezza. Se entro 90 secondi non si stabilizza, il watchdog ripristina la versione precedente.`,
                        confirmLabel: 'Installa e riavvia ora',
                        onCancel: () => confirmHost.replaceChildren(),
                        onConfirm: async () => {
                            const result = await api.post('/api/updates/apply', { ref: latest.tag }).catch((error) => ({ failure: error }));
                            confirmHost.replaceChildren();
                            feedback.replaceChildren(result.failure
                                ? notice('error', result.failure.message)
                                : notice('warn', `Aggiornamento a ${latest.tag} avviato. Il servizio si sta riavviando: ricarica fra 30-60 secondi.`));
                            await refresh();
                        }
                    }));
                }
            }, [icon('download'), el('span', { textContent: `Installa ${latest.tag} subito` })])
            : null;

        const reinstallButton = (!version.available && latest && status.supported && (status.phase === 'idle' || status.phase === 'healthy'))
            ? el('button', {
                className: 'btn',
                type: 'button',
                onclick: () => {
                    confirmHost.replaceChildren(confirmPanel({
                        title: `Reinstallare e forzare ${latest.tag}?`,
                        message: `Verranno riscaricati e riscritti tutti i file di programma allineandoli alla release ufficiale. Il watchdog garantisce il ripristino in caso di anomalie.`,
                        confirmLabel: 'Forza aggiornamento',
                        onCancel: () => confirmHost.replaceChildren(),
                        onConfirm: async () => {
                            const result = await api.post('/api/updates/apply', { ref: latest.tag, force: true }).catch((error) => ({ failure: error }));
                            confirmHost.replaceChildren();
                            feedback.replaceChildren(result.failure
                                ? notice('error', result.failure.message)
                                : notice('warn', `Sincronizzazione e forzatura a ${latest.tag} avviata. Il servizio si sta riavviando: ricarica fra 30-60 secondi.`));
                            await refresh();
                        }
                    }));
                }
            }, [icon('refresh'), el('span', { textContent: 'Forza aggiornamento / Ripara installazione' })])
            : null;

        return card({
            title: 'Canale di aggiornamento ufficiale GitHub',
            subtitle: version.detail,
            iconName: 'download',
            tone: version.tone === 'ok' ? 'emerald' : (version.tone === 'warn' ? 'amber' : 'cyan'),
            badge: phaseBadge(status.phase),
            actions: [installButton, reinstallButton].filter(Boolean),
            body: [
                workflowSteps(),
                releaseDetail(status.lastCheck),
                status.message ? el('p', { className: 'section__hint', textContent: `Ultimo esito: ${status.message}` }) : null
            ]
        });
    };

    const watchdogCard = (watchdog) => {
        const resetButton = actionButton('Azzera stato watchdog', 'shield', 'btn', async () => {
            const result = await api.post('/api/updates/watchdog/reset').catch((error) => ({ failure: error }));
            feedback.replaceChildren(result.failure
                ? notice('error', result.failure.message)
                : notice('ok', 'Watchdog azzerato: quarantena svuotata e contatore dei tentativi riportato a zero.'));
            await refresh();
        });

        return card({
            title: 'Protezione watchdog e ripristino automatico',
            subtitle: 'Sorveglia i primi 90 secondi dopo un aggiornamento e ripristina la versione precedente se il servizio non si stabilizza',
            iconName: 'shield',
            tone: watchdog.tone === 'ok' ? 'emerald' : (watchdog.tone === 'bad' ? 'red' : 'amber'),
            badge: chip(watchdog.label, watchdog.tone === 'ok' ? 'ok' : (watchdog.tone === 'bad' ? 'bad' : 'warn')),
            actions: watchdog.settled && !watchdog.quarantined ? [] : [resetButton],
            body: [
                optionRow({
                    title: 'Tentativi di avvio consumati',
                    hint: 'Il contatore torna a zero non appena il sistema resta stabile per la finestra di salute',
                    iconName: 'activity',
                    control: chip(`${watchdog.attempts}/${watchdog.maxAttempts}`, watchdog.attempts === 0 ? 'ok' : 'warn')
                }),
                optionRow({
                    title: 'Versioni in quarantena',
                    hint: 'Release escluse dall aggiornamento automatico dopo un ripristino',
                    iconName: 'lock',
                    control: watchdog.quarantined
                        ? el('div', { className: 'row row--tight row--wrap' }, watchdog.quarantineList.map((tag) => chip(tag, 'bad')))
                        : chip('Nessuna', 'ok')
                }),
                optionRow({
                    title: 'Versione precedente registrata',
                    hint: 'Punto di ripristino usato dal watchdog in caso di avvio fallito',
                    iconName: 'archive',
                    control: chip(status.previousVersion ? `v${status.previousVersion}` : 'Nessuna', 'info')
                }),
                el('p', { className: 'xcard__note' }, [
                    icon('info'),
                    el('span', { textContent: watchdog.hint })
                ])
            ]
        });
    };

    const policyCard = () => {
        const draft = { ...settings };
        const message = el('span', { className: 'section__hint' });
        const isWindow = () => (draft['updates.restartPolicy'] ?? 'ask') === 'window';

        const daysRow = optionRow({
            title: 'Giorni consentiti per la manutenzione',
            hint: 'Giorni della settimana in cui e ammesso il riavvio per un aggiornamento',
            iconName: 'timeline',
            control: controlFor({ type: 'days', value: draft['updates.windowDays'] ?? [0, 1, 2, 3, 4, 5, 6] }, (value) => {
                draft['updates.windowDays'] = value;
            })
        });

        const hoursRow = optionRow({
            title: 'Fascia oraria della finestra',
            hint: 'Intervallo notturno o a basso traffico, ad esempio 03:00 - 05:00',
            iconName: 'clock',
            control: el('div', { className: 'row row--tight row--nowrap' }, [
                controlFor({ type: 'time', value: draft['updates.windowStart'] ?? '03:00' }, (value) => { draft['updates.windowStart'] = value; }),
                el('span', { textContent: '→' }),
                controlFor({ type: 'time', value: draft['updates.windowEnd'] ?? '05:00' }, (value) => { draft['updates.windowEnd'] = value; })
            ])
        });

        daysRow.hidden = !isWindow();
        hoursRow.hidden = !isWindow();

        const saveButton = actionButton('Salva politiche', 'check', 'btn btn--primary', async () => {
            const result = await api.put('/api/settings', draft).catch((error) => ({ failure: error }));
            message.textContent = result.failure ? `Errore: ${result.failure.message}` : 'Politiche salvate.';
            if (!result.failure) await refresh();
        });

        return card({
            title: 'Politiche di installazione e finestre di manutenzione',
            subtitle: 'Decide quando ARGUS-PR puo cercare e applicare una nuova versione',
            iconName: 'settings',
            tone: 'blue',
            body: [
                optionRow({
                    title: 'Cerca aggiornamenti automaticamente',
                    hint: 'Controlla la presenza di nuove versioni su GitHub all avvio e ogni sei ore',
                    iconName: 'refresh',
                    control: toggle(draft['updates.autoCheck'] !== false, (value) => { draft['updates.autoCheck'] = value; })
                }),
                optionRow({
                    title: 'Politica di riavvio',
                    hint: 'Determina se il riavvio richiede una conferma, attende una finestra oraria o avviene subito',
                    iconName: 'power',
                    control: segmented(RESTART_OPTIONS, draft['updates.restartPolicy'] ?? 'ask', (value) => {
                        draft['updates.restartPolicy'] = value;
                        daysRow.hidden = value !== 'window';
                        hoursRow.hidden = value !== 'window';
                    }, { compact: true })
                }),
                daysRow,
                hoursRow
            ],
            footer: [message, saveButton]
        });
    };

    const render = () => {
        if (status.failure) {
            root.replaceChildren(
                pageHead({ title: 'Aggiornamenti & Manutenzione', hint: 'Gestione del ciclo di vita del software e aggiornamenti OTA' }),
                notice('error', `Impossibile caricare lo stato degli aggiornamenti: ${status.failure.message}`)
            );
            return;
        }

        const version = versionState(status);
        const watchdog = watchdogState(status);

        root.replaceChildren(
            pageHead({
                title: 'Aggiornamenti & Manutenzione',
                hint: 'Versioni, auto-upgrade OTA da GitHub, watchdog di ripristino e finestre di manutenzione',
                actions: headerActions()
            }),
            feedback,
            confirmHost,
            statusTiles(status, version, watchdog),
            heroBanner(version),
            el('div', { className: 'xstack' }, [
                installCard(version),
                offlineUpdateCard({
                    api,
                    currentVersion: status.currentVersion,
                    onApplied: () => { refresh(); }
                }),
                watchdogCard(watchdog),
                policyCard()
            ])
        );
    };

    render();
    return root;
}
