import { el, chip, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, toggle, optionRow } from '/assets/ui.js';
import { go } from '/assets/router.js';
import { createAutoSaver, autosaveBar } from '/features/wall/apps/autosave.js';

const FIELDS = [
    { key: 'host', label: 'Server SMTP', hint: 'Esempio: smtp.dominio.it. Deve essere un servizio diverso da quello delle automazioni' },
    { key: 'username', label: 'Utente SMTP', hint: 'Lascialo vuoto se il server non richiede autenticazione' },
    { key: 'sender', label: 'Indirizzo mittente', hint: 'Da questa casella partono i messaggi di recupero', type: 'email' },
    { key: 'replyTo', label: 'Indirizzo di risposta', hint: 'Facoltativo: dove arrivano le risposte degli utenti', type: 'email' },
    { key: 'publicUrl', label: 'Indirizzo pubblico dell impianto', hint: 'Solo HTTPS, esempio https://nvr.azienda.it. Senza, il messaggio contiene il codice invece del collegamento' }
];

export async function renderRecoveryMailer({ api }) {
    const host = el('div', { className: 'xstack' });
    const feedback = el('div', {});

    const initial = await api.get('/api/auth/recovery/settings').catch((error) => ({ failure: error }));

    if (initial.failure) {
        host.replaceChildren(notice('error', `Configurazione non disponibile: ${initial.failure.message}`));
        return host;
    }

    let mailer = { ...initial.mailer };
    let ready = initial.ready;

    const saver = createAutoSaver({
        api,
        path: '/api/auth/recovery/settings',
        onApplied: (result) => {
            mailer = { ...result.mailer, password: undefined };
            ready = result.ready;
        }
    });

    const touch = ({ redraw = false } = {}) => {
        saver.save(mailer);
        if (redraw) render();
    };

    const field = (definition) => {
        const input = el('input', {
            className: 'input',
            type: definition.type ?? 'text',
            value: mailer[definition.key] ?? '',
            placeholder: definition.hint,
            autocomplete: 'off'
        });

        input.addEventListener('input', () => {
            mailer[definition.key] = input.value;
            touch();
        });

        return el('div', { className: 'field' }, [
            el('label', { textContent: definition.label }),
            input,
            el('span', { className: 'field__hint', textContent: definition.hint })
        ]);
    };

    const portInput = () => {
        const input = el('input', { className: 'input', type: 'number', min: '1', max: '65535', value: String(mailer.port ?? 587) });
        input.addEventListener('input', () => {
            mailer.port = Number.parseInt(input.value, 10) || 587;
            touch();
        });
        return input;
    };

    const passwordInput = () => {
        const input = el('input', {
            className: 'input',
            type: 'password',
            autocomplete: 'new-password',
            placeholder: mailer.hasPassword ? 'Password memorizzata: scrivi qui per sostituirla' : 'Password del server SMTP'
        });

        input.addEventListener('input', () => {
            mailer.password = input.value;
            touch();
        });

        return input;
    };

    const testCard = () => {
        const target = el('input', { className: 'input', type: 'email', placeholder: 'Indirizzo dove ricevere la prova' });
        const output = el('div', {});

        const run = el('button', { className: 'btn btn--sm btn--primary', type: 'button' }, [
            icon('play'),
            el('span', { textContent: 'Invia una prova' })
        ]);

        run.addEventListener('click', async () => {
            run.disabled = true;
            const result = await api.post('/api/auth/recovery/settings/test', { to: target.value })
                .catch((error) => ({ failure: error }));
            run.disabled = false;

            output.replaceChildren(result.failure
                ? notice('error', `Prova non riuscita: ${result.failure.message}`)
                : notice('ok', `Messaggio di prova inviato a ${result.to}.`));
        });

        return card({
            title: 'Prova di consegna',
            subtitle: 'Verifica che il server risponda davvero prima di contare su di lui in un emergenza',
            iconName: 'activity',
            tone: ready ? 'emerald' : 'amber',
            badge: chip(ready ? 'Pronto' : 'Non configurato', ready ? 'ok' : 'warn'),
            body: [
                el('div', { className: 'field' }, [el('label', { textContent: 'Destinatario della prova' }), target]),
                el('div', { className: 'row row--end' }, [run]),
                output
            ]
        });
    };

    const back = el('button', { className: 'btn btn--sm', type: 'button' }, [
        icon('chevronLeft'),
        el('span', { textContent: 'Utenti' })
    ]);

    back.addEventListener('click', () => go('users'));

    const render = () => {
        host.replaceChildren(
            el('div', { className: 'row row--between' }, [
                el('div', { className: 'row row--tight' }, [back, chip('Server di recupero', 'info')]),
                chip(ready ? 'Recupero attivo' : 'Recupero non disponibile', ready ? 'ok' : 'warn')
            ]),
            feedback,
            autosaveBar(saver.element),
            card({
                title: 'Server SMTP dedicato al recupero',
                subtitle: 'Separato da quello delle automazioni: se un attaccante compromette le notifiche non ottiene anche la strada per reimpostare le password',
                iconName: 'lock',
                tone: 'purple',
                badge: mailer.hasPassword ? chip('Password memorizzata', 'ok') : null,
                body: [
                    optionRow({
                        title: 'Recupero della password attivo',
                        hint: 'Spento, nessuno puo reimpostare la password da solo: serve sempre un amministratore',
                        iconName: 'shield',
                        control: toggle(mailer.enabled === true, (value) => {
                            mailer.enabled = value;
                            touch({ redraw: true });
                        })
                    }),
                    el('div', { className: 'grid grid--fields' }, [
                        ...FIELDS.map(field),
                        el('div', { className: 'field' }, [
                            el('label', { textContent: 'Porta' }),
                            portInput(),
                            el('span', { className: 'field__hint', textContent: '587 con STARTTLS, 465 con TLS diretto' })
                        ]),
                        el('div', { className: 'field' }, [
                            el('label', { textContent: 'Password SMTP' }),
                            passwordInput(),
                            el('span', { className: 'field__hint', textContent: 'Conservata cifrata: non viene mai restituita dall interfaccia' })
                        ])
                    ]),
                    optionRow({
                        title: 'TLS diretto',
                        hint: 'Da attivare solo sulla porta 465. Sulle altre si usa STARTTLS',
                        iconName: 'lock',
                        control: toggle(mailer.secure === true, (value) => {
                            mailer.secure = value;
                            touch({ redraw: true });
                        })
                    }),
                    optionRow({
                        title: 'Pretendi STARTTLS',
                        hint: 'Spegnerlo lascia passare la password in chiaro: fallo solo su una rete che controlli interamente',
                        iconName: 'shield',
                        control: toggle(mailer.startTls !== false, (value) => {
                            mailer.startTls = value;
                            touch({ redraw: true });
                        })
                    }),
                    el('p', { className: 'xcard__note' }, [
                        icon('info'),
                        el('span', {
                            textContent: 'Il collegamento di recupero vale trenta minuti, si usa una volta sola e chiude tutte le sessioni aperte dell utente. Il codice a sei cifre resta obbligatorio anche dopo: recuperare la password non aggira il secondo fattore.'
                        })
                    ])
                ]
            }),
            testCard()
        );
    };

    host.addEventListener('argus:teardown', () => saver.stop());

    render();
    return host;
}
