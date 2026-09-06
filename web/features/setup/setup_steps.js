import { t } from '/assets/i18n.js';
import { api } from '/assets/api.js';
import { el, chip, field, notice, formatBytes } from '/assets/dom.js';
import { getLocale, getAvailableLocales, setLocale } from '/assets/i18n.js';

function specRow(label, value) {
    return el('div', { className: 'spec' }, [
        el('span', { className: 'spec__k', textContent: label }),
        el('span', { className: 'spec__v', textContent: value })
    ]);
}

export function welcomeStep({ status }) {
    const system = status.system;

    const locales = getAvailableLocales();
    const langSelect = el('select', {
        className: 'select',
        value: getLocale(),
        onchange: (e) => setLocale(e.target.value)
    }, locales.map((loc) => el('option', { value: loc.code, textContent: loc.name })));

    return {
        title: t('setup.benvenuto', 'Benvenuto'),
        summary: 'Cosa stai per configurare',
        body: el('div', { className: 'stack' }, [
            el('p', { className: 'step__lead', textContent: t('setup.aRGUSPRRegistraLeTueTelec', 'ARGUS-PR registra le tue telecamere IP su questa macchina. Nessun servizio esterno, nessun abbonamento: i video restano su un disco che controlli tu.') }),
            el('div', { className: 'panel panel--inset' }, [
                el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: t('setup.linguaDiInstallazione', 'Lingua di installazione') })]),
                el('div', { className: 'form-group' }, [
                    el('label', { className: 'label', textContent: t('setup.selezionaLaLinguaDellInter', 'Seleziona la lingua dell interfaccia') }),
                    langSelect
                ])
            ]),
            el('div', { className: 'panel panel--inset' }, [
                el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: t('setup.macchinaRilevata', 'Macchina rilevata') })]),
                el('div', { className: 'spec-grid' }, [
                    specRow('Host', system.hostname),
                    specRow('Sistema', `${system.platform} · ${system.arch}`),
                    specRow('Node.js', system.node),
                    specRow('Processore', `${system.cpus} core`),
                    specRow('Memoria', formatBytes(system.totalMemoryBytes)),
                    specRow('Versione', `ARGUS-PR ${status.version}`)
                ])
            ]),
            el('p', { className: 'step__hint', textContent: t('setup.laProceduraRichiedeMenoDi', "La procedura richiede meno di due minuti: creerai l'account amministratore, preparerai il motore video e confermerai dove salvare le registrazioni.") })
        ]),
        validate: () => true
    };
}

export function accountStep({ state }) {
    const username = el('input', { className: 'input', type: 'text', value: state.username, autocomplete: 'username', spellcheck: 'false' });
    const password = el('input', { className: 'input', type: 'password', autocomplete: 'new-password' });
    const confirm = el('input', { className: 'input', type: 'password', autocomplete: 'new-password' });
    const feedback = el('div', {});

    const rules = [
        { label: 'Almeno 12 caratteri', test: (value) => value.length >= 12 },
        { label: 'Una minuscola', test: (value) => /[a-z]/.test(value) },
        { label: 'Una maiuscola', test: (value) => /[A-Z]/.test(value) },
        { label: 'Una cifra', test: (value) => /[0-9]/.test(value) }
    ];

    const ruleRow = el('div', { className: 'row row--tight' });
    const strengthBar = el('span', { className: 'meter__fill' });

    const refresh = () => {
        const value = password.value;
        const passed = rules.filter((rule) => rule.test(value)).length;

        ruleRow.replaceChildren(...rules.map((rule) => chip(rule.label, rule.test(value) ? 'ok' : null)));
        strengthBar.className = `meter__fill meter__fill--${passed}`;

        state.username = username.value.trim();
        state.password = value;
        state.passwordConfirm = confirm.value;
    };

    username.addEventListener('input', refresh);
    password.addEventListener('input', refresh);
    confirm.addEventListener('input', refresh);
    refresh();

    return {
        title: t('setup.amministratore', 'Amministratore'),
        summary: 'Account con pieni poteri',
        body: el('div', { className: 'stack' }, [
            el('p', { className: 'step__lead', textContent: t('setup.questoAccountPotrGestireT', "Questo account potrà gestire telecamere, archivio, utenti e impostazioni. Sceglilo con cura: è la chiave dell'intero sistema.") }),
            field('Nome utente', username),
            field('Password', password),
            el('span', { className: 'meter' }, [strengthBar]),
            ruleRow,
            field('Conferma password', confirm),
            el('p', { className: 'step__hint', textContent: t('setup.laPasswordVieneProtettaCon', 'La password viene protetta con scrypt e un salt individuale. Non è recuperabile: se la perdi, servirà accesso locale alla macchina per rigenerarla.') }),
            feedback
        ]),
        validate: () => {
            feedback.replaceChildren();

            if (state.username.length < 3) {
                feedback.replaceChildren(notice('error', 'Il nome utente deve avere almeno 3 caratteri.'));
                return false;
            }
            if (rules.some((rule) => !rule.test(state.password))) {
                feedback.replaceChildren(notice('error', 'La password non soddisfa tutti i requisiti.'));
                return false;
            }
            if (state.password !== state.passwordConfirm) {
                feedback.replaceChildren(notice('error', 'Le due password non coincidono.'));
                return false;
            }
            return true;
        }
    };
}

export function mediaStep({ state, onStatusChange }) {
    const body = el('div', { className: 'stack' });
    const feedback = el('div', {});

    const render = () => {
        const media = state.media;

        if (media.available) {
            body.replaceChildren(
                el('p', { className: 'step__lead', textContent: t('setup.ilMotoreVideoProntoARGU', 'Il motore video è pronto. ARGUS-PR lo userà per acquisire, registrare e riprodurre i flussi delle telecamere.') }),
                el('div', { className: 'panel panel--inset' }, [
                    el('div', { className: 'panel__head' }, [
                        el('span', { className: 'panel__title', textContent: t('setup.ffmpeg', 'ffmpeg') }),
                        chip('pronto', 'ok')
                    ]),
                    el('div', { className: 'spec-grid' }, [
                        specRow('Versione', media.ffmpegVersion ?? 'sconosciuta'),
                        specRow('Percorso', media.ffmpegPath ?? '--')
                    ]),
                    media.accelerators?.length
                        ? el('div', { className: 'panel__body' }, [
                            el('span', { className: 'step__hint', textContent: t('setup.accelerazioniHardwareDisponi', 'Accelerazioni hardware disponibili:') }),
                            el('div', { className: 'row row--tight' }, media.accelerators.map((name) => chip(name, 'info')))
                        ])
                        : null
                ])
            );
            return;
        }

        const install = el('button', {
            className: 'btn btn--primary',
            type: 'button',
            textContent: t('setup.installaAutomaticamente', 'Installa automaticamente'),
            onclick: async () => {
                install.disabled = true;
                install.textContent = 'Installazione in corso…';
                feedback.replaceChildren(notice('info', 'Download e verifica dell\'integrità in corso. Può richiedere qualche minuto: non chiudere questa pagina.'));

                const outcome = await api.post('/api/setup/dependencies/ffmpeg').catch((error) => error);

                install.disabled = false;
                install.textContent = 'Installa automaticamente';

                if (outcome instanceof Error) {
                    feedback.replaceChildren(notice('error', outcome.message));
                    return;
                }

                state.media = outcome.media;
                onStatusChange();
                render();
            }
        });

        body.replaceChildren(
            el('p', { className: 'step__lead', textContent: t('setup.aRGUSPRUsaFfmpegPerParlar', 'ARGUS-PR usa ffmpeg per parlare con le telecamere. Non è presente su questa macchina: posso installarlo io.') }),
            el('div', { className: 'panel panel--inset' }, [
                el('div', { className: 'panel__head' }, [
                    el('span', { className: 'panel__title', textContent: t('setup.ffmpeg', 'ffmpeg') }),
                    chip('mancante', 'bad')
                ]),
                el('div', { className: 'panel__body' }, [
                    state.media.installable
                        ? el('div', { className: 'stack--tight' }, [
                            el('span', { className: 'step__hint', textContent: t('setup.ilBinarioVieneScaricatoDa', "Il binario viene scaricato da una release GitHub fissata, verificato con SHA-256 e installato nella cartella dell'applicazione. Non servono privilegi di amministratore e nulla viene modificato nel sistema.") }),
                            el('div', { className: 'row' }, [install])
                        ])
                        : notice('warn', `Installazione automatica non disponibile per questa piattaforma. Installa ffmpeg con il gestore pacchetti del sistema e riavvia.`),
                    feedback
                ])
            ]),
            el('p', { className: 'step__hint', textContent: t('setup.puoiProseguireAncheSenzaL', 'Puoi proseguire anche senza: la configurazione si completa, ma registrazione e riproduzione resteranno inattive finché ffmpeg non sarà disponibile.') })
        );
    };

    render();

    return {
        title: t('setup.motoreVideo', 'Motore video'),
        summary: 'Componente per acquisizione e riproduzione',
        body,
        validate: () => true
    };
}

export function storageStep({ status }) {
    const disk = status.storage.mediaDisk;

    return {
        title: t('setup.archiviazione', 'Archiviazione'),
        summary: 'Dove finiscono le registrazioni',
        body: el('div', { className: 'stack' }, [
            el('p', { className: 'step__lead', textContent: t('setup.leRegistrazioniSonoFileNor', 'Le registrazioni sono file normali su disco. Puoi spostarle in seguito su un secondo disco o su un NAS senza reinstallare nulla.') }),
            el('div', { className: 'panel panel--inset' }, [
                el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: t('setup.percorsi', 'Percorsi') })]),
                el('div', { className: 'spec-grid' }, [
                    specRow('Configurazione', status.storage.dataDir),
                    specRow('Registrazioni', status.storage.mediaDir)
                ])
            ]),
            disk
                ? el('div', { className: 'panel panel--inset' }, [
                    el('div', { className: 'panel__head' }, [
                        el('span', { className: 'panel__title', textContent: t('setup.spazioDisponibile', 'Spazio disponibile') }),
                        chip(`${disk.usedPercent}% usato`, disk.usedPercent > 85 ? 'warn' : 'ok')
                    ]),
                    el('div', { className: 'spec-grid' }, [
                        specRow('Libero', formatBytes(disk.freeBytes)),
                        specRow('Totale', formatBytes(disk.totalBytes))
                    ])
                ])
                : notice('warn', 'Impossibile leggere lo spazio disponibile su questo volume.'),
            el('p', { className: 'step__hint', textContent: t('setup.perCambiarePercorsoImposta', 'Per cambiare percorso imposta ARGUS_MEDIA_DIR e riavvia il servizio. Un flusso 1080p occupa indicativamente 1,5–3 GB al giorno per telecamera.') })
        ]),
        validate: () => true
    };
}

export function reviewStep({ state, status }) {
    const body = el('div', { className: 'stack' });

    const render = () => {
        body.replaceChildren(
            el('p', { className: 'step__lead', textContent: t('setup.controllaIlRiepilogoComple', "Controlla il riepilogo. Completando, l'account viene creato e la configurazione iniziale si chiude definitivamente.") }),
            el('div', { className: 'panel panel--inset' }, [
                el('div', { className: 'spec-grid' }, [
                    specRow('Amministratore', state.username),
                    specRow('Motore video', state.media.available ? `ffmpeg ${state.media.ffmpegVersion}` : 'non disponibile'),
                    specRow('Registrazioni', status.storage.mediaDir),
                    specRow('Indirizzo', `${status.network.host}:${status.network.port}`)
                ])
            ]),
            state.media.available
                ? notice('ok', 'Il sistema è pronto per aggiungere le prime telecamere.')
                : notice('warn', 'Senza ffmpeg potrai configurare le telecamere ma non registrare. Potrai installarlo dopo dalle impostazioni.')
        );
    };

    render();

    return {
        title: t('setup.riepilogo', 'Riepilogo'),
        summary: 'Conferma e completa',
        body,
        onEnter: render,
        validate: () => true
    };
}

