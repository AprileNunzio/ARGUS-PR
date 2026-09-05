import { el, chip, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, toggle, optionRow } from '/assets/ui.js';
import { go } from '/assets/router.js';
import { createAutoSaver, autosaveBar } from '/features/wall/apps/autosave.js';
import {
    IDENTITY_FIELDS,
    CONTACT_FIELDS,
    ADDRESS_FIELDS,
    WORK_FIELDS,
    fieldGroup,
    notificationCard,
    languageRow,
    roleRow,
    permissionList
} from './user_fields.js';

const PROFILE_KEYS = [
    ...IDENTITY_FIELDS, ...CONTACT_FIELDS, ...ADDRESS_FIELDS, ...WORK_FIELDS
].map((definition) => definition.key).concat(['language', 'notifyEmail', 'notifyAlarm', 'notifySystem', 'notifyDigest', 'notes']);

function profileOf(user) {
    return Object.fromEntries(PROFILE_KEYS.map((key) => [key, user[key] ?? (typeof user[key] === 'boolean' ? false : '')]));
}

export async function renderUserDetail({ api, userId, session }) {
    const host = el('div', { className: 'xstack' });
    const feedback = el('div', {});

    const catalogue = await api.get('/api/users/roles').catch(() => ({ roles: [] }));
    let user = await api.get(`/api/users/${encodeURIComponent(userId)}`).catch((error) => ({ failure: error }));

    if (user.failure) {
        host.replaceChildren(notice('error', `Scheda non disponibile: ${user.failure.message}`));
        return host;
    }

    let profile = profileOf(user);
    const isSelf = session?.id === user.id;

    const saver = createAutoSaver({
        api,
        path: `/api/users/${encodeURIComponent(userId)}`,
        onApplied: (result) => {
            user = result;
            profile = profileOf(result);
        }
    });

    const touch = ({ redraw = false } = {}) => {
        saver.save(profile);
        if (redraw) render();
    };

    const onInput = (key, value) => {
        profile[key] = value;
        touch();
    };

    const accessCard = () => {
        const suspend = toggle(user.active === true, async (value) => {
            const result = await api.put(`/api/users/${encodeURIComponent(userId)}/access`, { active: value })
                .catch((error) => ({ failure: error }));

            if (result.failure) {
                feedback.replaceChildren(notice('error', `Stato non modificato: ${result.failure.message}`));
                render();
                return;
            }

            user = result;
            feedback.replaceChildren(notice('ok', value ? 'Utente riattivato.' : 'Utente sospeso: le sue sessioni sono state chiuse.'));
            render();
        }, ['Attivo', 'Sospeso']);

        return card({
            title: 'Accesso e permessi',
            subtitle: 'Ruolo, stato dell account e cosa comporta in concreto',
            iconName: 'shield',
            tone: user.active ? 'emerald' : 'rose',
            badge: user.mfaEnabled ? chip('Secondo fattore attivo', 'ok') : chip('Senza secondo fattore', 'warn'),
            body: [
                roleRow(catalogue.roles ?? [], user.role, async (value) => {
                    const result = await api.put(`/api/users/${encodeURIComponent(userId)}/access`, { role: value })
                        .catch((error) => ({ failure: error }));

                    if (result.failure) {
                        feedback.replaceChildren(notice('error', `Ruolo non modificato: ${result.failure.message}`));
                        render();
                        return;
                    }

                    user = result;
                    feedback.replaceChildren(notice('ok', 'Ruolo aggiornato e permessi ricalcolati.'));
                    render();
                }, { disabled: isSelf }),
                optionRow({
                    title: 'Account attivo',
                    hint: 'Sospendendolo le sessioni aperte vengono chiuse subito e il login viene rifiutato',
                    iconName: 'lock',
                    control: isSelf
                        ? el('span', { className: 'chip chip--info', textContent: 'Il proprio account non si sospende da qui' })
                        : suspend
                }),
                el('div', { className: 'stack' }, [
                    el('span', { className: 'xrow__title', textContent: 'Permessi effettivi' }),
                    permissionList(user.permissions)
                ])
            ]
        });
    };

    const securityCard = () => {
        const reset = el('button', { className: 'btn btn--sm btn--danger', type: 'button' }, [
            icon('refresh'),
            el('span', { textContent: 'Genera una password provvisoria' })
        ]);

        const output = el('div', {});

        reset.addEventListener('click', async () => {
            reset.disabled = true;
            const result = await api.post(`/api/users/${encodeURIComponent(userId)}/password`, {})
                .catch((error) => ({ failure: error }));
            reset.disabled = false;

            if (result.failure) {
                output.replaceChildren(notice('error', `Reimpostazione non riuscita: ${result.failure.message}`));
                return;
            }

            output.replaceChildren(
                notice('ok', 'Password sostituita. Tutte le sessioni di questo utente sono state chiuse e al primo accesso dovra sceglierne una nuova.'),
                el('div', { className: 'xrow' }, [
                    el('span', { className: 'xrow__icon' }, [icon('lock')]),
                    el('div', { className: 'xrow__body' }, [
                        el('span', { className: 'xrow__title', textContent: 'Password provvisoria' }),
                        el('span', { className: 'xrow__hint', textContent: 'Consegnala di persona: non viene mostrata una seconda volta' })
                    ]),
                    el('code', { className: 'mono', textContent: result.temporaryPassword })
                ])
            );
        });

        return card({
            title: 'Sicurezza dell account',
            subtitle: 'Il secondo fattore resta obbligatorio anche dopo un recupero della password',
            iconName: 'lock',
            tone: 'amber',
            actions: isSelf ? [] : [reset],
            body: [
                el('div', { className: 'xrow' }, [
                    el('span', { className: 'xrow__icon' }, [icon(user.mfaEnabled ? 'shield' : 'warning')]),
                    el('div', { className: 'xrow__body' }, [
                        el('span', { className: 'xrow__title', textContent: 'Codice a sei cifre' }),
                        el('span', {
                            className: 'xrow__hint',
                            textContent: user.mfaEnabled
                                ? `Attivo dal ${new Date(user.mfaConfirmedAt).toLocaleString('it-IT')}. Solo la persona interessata puo riconfigurarlo dal proprio account.`
                                : 'Non ancora configurato. Ogni utente lo attiva dal proprio account, nella scheda Sicurezza.'
                        })
                    ]),
                    chip(user.mfaEnabled ? 'Attivo' : 'Assente', user.mfaEnabled ? 'ok' : 'warn')
                ]),
                el('div', { className: 'xrow' }, [
                    el('span', { className: 'xrow__icon' }, [icon(user.email ? 'globe' : 'warning')]),
                    el('div', { className: 'xrow__body' }, [
                        el('span', { className: 'xrow__title', textContent: 'Email di recupero' }),
                        el('span', {
                            className: 'xrow__hint',
                            textContent: user.email
                                ? `Il recupero della password arriva a ${user.email}.`
                                : 'Senza email registrata questa persona non puo recuperare la password da sola.'
                        })
                    ]),
                    chip(user.email ? 'Presente' : 'Mancante', user.email ? 'ok' : 'warn')
                ]),
                output
            ]
        });
    };

    const back = el('button', { className: 'btn btn--sm', type: 'button' }, [
        icon('chevronLeft'),
        el('span', { textContent: 'Utenti' })
    ]);

    back.addEventListener('click', () => go('users'));

    const remove = el('button', { className: 'btn btn--sm btn--danger', type: 'button' }, [
        icon('trash'),
        el('span', { textContent: 'Elimina utente' })
    ]);

    remove.addEventListener('click', async () => {
        remove.disabled = true;
        const result = await api.remove(`/api/users/${encodeURIComponent(userId)}`).catch((error) => ({ failure: error }));
        remove.disabled = false;

        if (result.failure) {
            feedback.replaceChildren(notice('error', `Eliminazione non riuscita: ${result.failure.message}`));
            return;
        }

        go('users');
    });

    const render = () => {
        host.replaceChildren(
            el('div', { className: 'row row--between' }, [
                el('div', { className: 'row row--tight' }, [back, chip(user.username, 'info'), chip(`profilo al ${user.completeness}%`, user.completeness >= 75 ? 'ok' : 'warn')]),
                isSelf ? null : remove
            ]),
            feedback,
            autosaveBar(saver.element),
            accessCard(),
            fieldGroup({
                title: 'Anagrafica',
                subtitle: 'Serve a identificare la persona con certezza quando serve un recupero o una verifica',
                iconName: 'users',
                tone: 'cyan',
                definitions: IDENTITY_FIELDS,
                values: profile,
                onInput
            }),
            fieldGroup({
                title: 'Recapiti',
                subtitle: 'L email e la strada del recupero password: senza, l utente dipende da un amministratore',
                iconName: 'globe',
                tone: 'emerald',
                definitions: CONTACT_FIELDS,
                values: profile,
                onInput,
                badge: user.email ? chip('Recupero possibile', 'ok') : chip('Recupero impossibile', 'warn')
            }),
            fieldGroup({
                title: 'Residenza',
                subtitle: 'Dati facoltativi, utili per le verifiche formali e per le comunicazioni cartacee',
                iconName: 'pin',
                tone: 'purple',
                definitions: ADDRESS_FIELDS,
                values: profile,
                onInput
            }),
            fieldGroup({
                title: 'Posizione nell organizzazione',
                subtitle: 'Aiuta a capire chi ha fatto cosa quando si legge il registro delle azioni',
                iconName: 'tag',
                tone: 'amber',
                definitions: WORK_FIELDS,
                values: profile,
                onInput
            }),
            card({
                title: 'Preferenze',
                subtitle: 'Lingua e note interne su questa persona',
                iconName: 'settings',
                tone: 'cyan',
                body: [
                    languageRow(profile.language, (value) => {
                        profile.language = value;
                        touch({ redraw: true });
                    }),
                    el('div', { className: 'field' }, [
                        el('label', { textContent: 'Note interne' }),
                        (() => {
                            const area = el('textarea', { className: 'input', rows: '3', textContent: profile.notes ?? '' });
                            area.addEventListener('input', () => onInput('notes', area.value));
                            return area;
                        })(),
                        el('span', { className: 'field__hint', textContent: 'Visibili solo a chi gestisce gli utenti' })
                    ])
                ]
            }),
            notificationCard({
                values: profile,
                onChange: (key, value) => {
                    profile[key] = value;
                    touch({ redraw: true });
                }
            }),
            securityCard()
        );
    };

    host.addEventListener('argus:teardown', () => saver.stop());

    render();
    return host;
}
