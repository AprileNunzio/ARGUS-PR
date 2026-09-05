import { el, chip, notice, confirmPanel, pageHead, formatBytes, formatDuration } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, optionRow, metricTile } from '/assets/ui.js';
import { capabilitiesBody } from './capabilities_card.js';

const CACHE_SCOPES = [
    { id: 'runtime', label: 'Cache applicative', hint: 'Impostazioni in memoria, esito dei controlli di aggiornamento, sessioni scadute e blocchi di accesso', icon: 'refresh' },
    { id: 'temporary', label: 'File temporanei', hint: 'Contenuto di dataDir/tmp e dataDir/cache lasciato da download e conversioni interrotte', icon: 'archive' },
    { id: 'thumbnails', label: 'Anteprime video', hint: 'Miniature rigenerabili dei segmenti registrati', icon: 'camera' },
    { id: 'database', label: 'Compattazione database', hint: 'Checkpoint del journal WAL e VACUUM di SQLite per recuperare spazio', icon: 'disk' }
];

const SERVICE_TONES = {
    active: 'ok',
    activating: 'warn',
    inactive: 'bad',
    failed: 'bad',
    unknown: 'warn',
    unmanaged: 'info'
};

export async function renderMaintenance({ api }) {
    const root = el('div', { className: 'view maintenance-view' });
    const feedback = el('div', {});
    const confirmHost = el('div', {});

    let data = await api.get('/api/system/maintenance').catch((error) => ({ failure: error }));
    let capabilities = await api.get('/api/system/capabilities').catch(() => null);
    const selectedScopes = new Set(['runtime', 'temporary']);

    const refresh = async () => {
        data = await api.get('/api/system/maintenance').catch((error) => ({ failure: error }));
        capabilities = await api.get('/api/system/capabilities').catch(() => capabilities);
        render();
    };

    const say = (kind, text) => feedback.replaceChildren(notice(kind, text));

    const machineCard = () => {
        const machine = data.machine;
        const usedPercent = machine.memory.totalBytes > 0
            ? Math.round(((machine.memory.totalBytes - machine.memory.freeBytes) / machine.memory.totalBytes) * 100)
            : 0;

        return card({
            title: 'Stato della macchina',
            subtitle: `${machine.hostname} · ${machine.platform}`,
            iconName: 'server',
            tone: 'cyan',
            badge: chip('Operativo', 'ok'),
            body: [
                el('div', { className: 'grid grid--stats' }, [
                    metricTile({ label: 'Uptime macchina', value: formatDuration(machine.uptimeSeconds), iconName: 'clock', tone: 'cyan' }),
                    metricTile({ label: 'Uptime servizio', value: formatDuration(machine.processUptimeSeconds), iconName: 'activity', tone: 'blue' }),
                    metricTile({ label: 'Memoria usata', value: `${usedPercent}%`, hint: `${formatBytes(machine.memory.totalBytes - machine.memory.freeBytes)} di ${formatBytes(machine.memory.totalBytes)}`, iconName: 'memory', tone: usedPercent > 85 ? 'red' : 'emerald' }),
                    metricTile({ label: 'Carico medio', value: machine.loadAverage.map((value) => value.toFixed(2)).join(' '), hint: '1, 5 e 15 minuti', iconName: 'cpu', tone: 'purple' })
                ]),
                el('div', { className: 'spec-grid' }, [
                    el('div', { className: 'spec' }, [
                        el('span', { className: 'spec__k', textContent: 'Directory dati' }),
                        el('span', { className: 'spec__v break', textContent: machine.dataDir })
                    ]),
                    el('div', { className: 'spec' }, [
                        el('span', { className: 'spec__k', textContent: 'Directory registrazioni' }),
                        el('span', { className: 'spec__v break', textContent: machine.mediaDir })
                    ])
                ])
            ]
        });
    };

    const capabilitiesCard = () => {
        const count = capabilities?.suggestions?.length ?? 0;

        return card({
            title: 'Capacita di questa macchina',
            subtitle: 'Cosa il tuo hardware mette a disposizione e cosa puoi decidere di abilitare',
            iconName: 'cpu',
            tone: count > 0 ? 'amber' : 'emerald',
            badge: chip(count > 0 ? `${count} suggerimenti` : 'Tutto sfruttato', count > 0 ? 'warn' : 'ok'),
            body: capabilitiesBody(capabilities)
        });
    };

    const servicesCard = () => card({
        title: 'Servizi di sistema',
        subtitle: 'Riavvio dei demoni gestiti da systemd senza toccare il terminale',
        iconName: 'activity',
        tone: 'blue',
        body: data.services.map((service) => optionRow({
            title: service.label,
            hint: `Unita ${service.id} · stato ${service.state}`,
            iconName: service.id === 'argus-pr-kiosk' ? 'monitor' : (service.id === 'argus-shield' ? 'shield' : 'server'),
            control: el('div', { className: 'row row--tight row--nowrap' }, [
                chip(service.state, SERVICE_TONES[service.state] ?? 'info'),
                el('button', {
                    className: 'btn btn--sm',
                    type: 'button',
                    disabled: service.available ? null : 'disabled',
                    onclick: async () => {
                        const result = await api.post(`/api/system/maintenance/service/${service.id}/restart`)
                            .catch((error) => ({ failure: error }));

                        if (result.failure) {
                            say('error', `Riavvio non riuscito: ${result.failure.message}`);
                            return;
                        }

                        say('warn', result.message ?? `Riavvio di ${service.label} avviato.`);
                        if (service.id !== 'argus-pr') await refresh();
                    }
                }, [icon('refresh'), el('span', { textContent: 'Riavvia' })])
            ])
        }))
    });

    const powerCard = () => {
        const powerButton = (action, label, description, iconName, className) => el('button', {
            className,
            type: 'button',
            onclick: () => {
                confirmHost.replaceChildren(confirmPanel({
                    title: label,
                    message: `${description} Le registrazioni in corso vengono interrotte e i flussi live si disconnettono.`,
                    confirmLabel: label,
                    onCancel: () => confirmHost.replaceChildren(),
                    onConfirm: async () => {
                        const result = await api.post('/api/system/maintenance/power', { action }).catch((error) => ({ failure: error }));
                        confirmHost.replaceChildren();

                        if (result.failure) {
                            say('error', result.failure.message);
                            return;
                        }

                        say('warn', action === 'reboot'
                            ? 'Riavvio della macchina accettato: il server tornera raggiungibile fra circa un minuto.'
                            : 'Spegnimento accettato: la macchina si sta arrestando.');
                    }
                }));
            }
        }, [icon(iconName), el('span', { textContent: label })]);

        return card({
            title: 'Alimentazione della macchina',
            subtitle: 'Riavvio e spegnimento ordinato del server, con arresto pulito dei registratori',
            iconName: 'power',
            tone: 'amber',
            badge: chip(data.machine.powerSupported ? 'Disponibile' : 'Non supportato', data.machine.powerSupported ? 'ok' : 'warn'),
            body: [
                notice('warn', 'Queste operazioni interrompono la videosorveglianza. Su Linux il servizio deve avere la regola polkit argus-maintenance.rules, altrimenti il comando viene rifiutato.'),
                el('div', { className: 'row row--tight' }, [
                    powerButton('reboot', 'Riavvia la macchina', 'Il sistema operativo verra riavviato completamente.', 'refresh', 'btn'),
                    powerButton('poweroff', 'Spegni la macchina', 'Il server verra arrestato e dovra essere riacceso manualmente.', 'power', 'btn btn--danger')
                ])
            ]
        });
    };

    const cacheCard = () => {
        const rows = CACHE_SCOPES.map((scope) => {
            const checkbox = el('input', { type: 'checkbox', checked: selectedScopes.has(scope.id) });
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) selectedScopes.add(scope.id);
                else selectedScopes.delete(scope.id);
            });

            return optionRow({
                title: scope.label,
                hint: scope.hint,
                iconName: scope.icon,
                control: el('label', { className: 'row row--tight' }, [checkbox, el('span', { textContent: 'Includi' })])
            });
        });

        const runButton = el('button', { className: 'btn btn--primary', type: 'button' }, [
            icon('trash'),
            el('span', { textContent: 'Svuota le cache selezionate' })
        ]);

        runButton.addEventListener('click', async () => {
            if (selectedScopes.size === 0) {
                say('warn', 'Seleziona almeno una categoria di cache da svuotare.');
                return;
            }

            runButton.disabled = true;
            const result = await api.post('/api/system/maintenance/cache', { scopes: [...selectedScopes] })
                .catch((error) => ({ failure: error }));
            runButton.disabled = false;

            if (result.failure) {
                say('error', `Pulizia non riuscita: ${result.failure.message}`);
                return;
            }

            const parts = [`${result.files} file rimossi`, `${formatBytes(result.bytes)} liberati`];
            if (result.sessions > 0) parts.push(`${result.sessions} sessioni scadute eliminate`);
            if (result.reclaimedBytes > 0) parts.push(`${formatBytes(result.reclaimedBytes)} recuperati dal database`);

            say('ok', `Pulizia completata: ${parts.join(', ')}.`);
            await refresh();
        });

        return card({
            title: 'Pulizia cache e manutenzione dati',
            subtitle: 'Libera spazio senza toccare le registrazioni: i filmati archiviati non vengono mai eliminati da qui',
            iconName: 'trash',
            tone: 'emerald',
            body: rows,
            footer: [
                el('span', { className: 'section__hint', textContent: `${selectedScopes.size} categorie selezionate` }),
                runButton
            ]
        });
    };

    const render = () => {
        if (data.failure) {
            root.replaceChildren(
                pageHead({ title: 'Gestione Macchina & Manutenzione', hint: 'Servizi, alimentazione e pulizia delle cache' }),
                notice('error', `Impossibile leggere lo stato della macchina: ${data.failure.message}`)
            );
            return;
        }

        root.replaceChildren(
            pageHead({
                title: 'Gestione Macchina & Manutenzione',
                hint: 'Riavvio dei servizi, alimentazione del server, pulizia delle cache e stato delle risorse',
                actions: [
                    el('button', {
                        className: 'btn',
                        type: 'button',
                        onclick: refresh
                    }, [icon('refresh'), el('span', { textContent: 'Aggiorna stato' })])
                ]
            }),
            feedback,
            confirmHost,
            el('div', { className: 'xstack' }, [
                machineCard(),
                capabilitiesCard(),
                servicesCard(),
                cacheCard(),
                powerCard()
            ])
        );
    };

    render();
    return root;
}
