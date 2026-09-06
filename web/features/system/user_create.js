import { t } from '/assets/i18n.js';
import { el, chip, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, toggle, optionRow } from '/assets/ui.js';
import { go } from '/assets/router.js';
import {
    IDENTITY_FIELDS,
    CONTACT_FIELDS,
    ADDRESS_FIELDS,
    WORK_FIELDS,
    fieldGroup,
    notificationCard,
    languageRow,
    roleRow
} from './user_fields.js';

const BLANK = Object.freeze({
    username: '',
    role: 'viewer',
    language: 'it',
    notifyEmail: true,
    notifyAlarm: true,
    notifySystem: false,
    notifyDigest: false
});

export async function renderUserCreate({ api }) {
    const host = el('div', { className: 'xstack' });
    const feedback = el('div', {});

    const catalogue = await api.get('/api/users/roles').catch(() => ({ roles: [] }));
    const draft = { ...BLANK };
    let generatePassword = true;

    const onInput = (key, value) => {
        draft[key] = value;
    };

    const usernameInput = el('input', {
        className: 'input',
        placeholder: t('system.da3A32CaratteriLettere', 'Da 3 a 32 caratteri: lettere, numeri, punto, trattino'),
        autocomplete: 'off'
    });

    usernameInput.addEventListener('input', () => {
        draft.username = usernameInput.value;
    });

    const passwordInput = el('input', { className: 'input', type: 'password', autocomplete: 'new-password' });
    passwordInput.addEventListener('input', () => {
        draft.password = passwordInput.value;
    });

    const passwordField = el('div', { className: 'field' }, [
        el('label', { textContent: t('system.passwordIniziale', 'Password iniziale') }),
        passwordInput,
        el('span', { className: 'field__hint', textContent: t('system.almenoDodiciCaratteriLUte', 'Almeno dodici caratteri. L utente dovra comunque cambiarla al primo accesso') })
    ]);

    passwordField.hidden = true;

    const output = el('div', {});

    const submit = el('button', { className: 'btn btn--primary', type: 'button' }, [
        icon('check'),
        el('span', { textContent: t('system.creaUtente', 'Crea utente') })
    ]);

    submit.addEventListener('click', async () => {
        submit.disabled = true;
        feedback.replaceChildren();

        const payload = { ...draft };
        if (generatePassword) delete payload.password;

        const result = await api.post('/api/users', payload).catch((error) => ({ failure: error }));
        submit.disabled = false;

        if (result.failure) {
            feedback.replaceChildren(notice('error', `Creazione non riuscita: ${result.failure.message}`));
            return;
        }

        const open = el('button', { className: 'btn btn--sm', type: 'button' }, [
            icon('edit'),
            el('span', { textContent: t('system.apriLaScheda', 'Apri la scheda') })
        ]);

        open.addEventListener('click', () => go('users', result.user.id));

        output.replaceChildren(
            notice('ok', `Utente ${result.user.username} creato con ruolo ${result.user.role}.`),
            result.temporaryPassword
                ? el('div', { className: 'xrow' }, [
                    el('span', { className: 'xrow__icon' }, [icon('lock')]),
                    el('div', { className: 'xrow__body' }, [
                        el('span', { className: 'xrow__title', textContent: t('system.passwordProvvisoria', 'Password provvisoria') }),
                        el('span', { className: 'xrow__hint', textContent: t('system.consegnalaDiPersonaNonVie', 'Consegnala di persona: non viene mostrata una seconda volta') })
                    ]),
                    el('code', { className: 'mono', textContent: result.temporaryPassword })
                ])
                : null,
            el('div', { className: 'row row--end' }, [open])
        );
    });

    const back = el('button', { className: 'btn btn--sm', type: 'button' }, [
        icon('chevronLeft'),
        el('span', { textContent: t('system.utenti', 'Utenti') })
    ]);

    back.addEventListener('click', () => go('users'));

    const render = () => {
        host.replaceChildren(
            el('div', { className: 'row row--between' }, [
                el('div', { className: 'row row--tight' }, [back, chip('Nuovo utente', 'info')]),
                submit
            ]),
            feedback,
            output,
            card({
                title: t('system.credenzialiDiAccesso', 'Credenziali di accesso'),
                subtitle: t('system.ilNomeUtenteServePerEntra', 'Il nome utente serve per entrare, l email per recuperare la password'),
                iconName: 'lock',
                tone: 'emerald',
                body: [
                    el('div', { className: 'field' }, [
                        el('label', { textContent: t('system.nomeUtente', 'Nome utente') }),
                        usernameInput,
                        el('span', { className: 'field__hint', textContent: t('system.vieneConvertitoInMinuscolo', 'Viene convertito in minuscolo e non si potra piu cambiare') })
                    ]),
                    optionRow({
                        title: t('system.passwordProvvisoriaGenerata', 'Password provvisoria generata dal sistema'),
                        hint: 'Venti caratteri casuali mostrati una sola volta, molto piu robusti di una scelta a mano',
                        iconName: 'sparkles',
                        control: toggle(generatePassword, (value) => {
                            generatePassword = value;
                            passwordField.hidden = value;
                        }, ['Genera', 'La scelgo io'])
                    }),
                    passwordField,
                    roleRow(catalogue.roles ?? [], draft.role, (value) => {
                        draft.role = value;
                        render();
                    })
                ]
            }),
            fieldGroup({
                title: t('system.anagrafica', 'Anagrafica'),
                subtitle: t('system.identificaLaPersonaConCert', 'Identifica la persona con certezza: serve per i recuperi e per il registro delle azioni'),
                iconName: 'users',
                tone: 'cyan',
                definitions: IDENTITY_FIELDS,
                values: draft,
                onInput
            }),
            fieldGroup({
                title: t('system.recapiti', 'Recapiti'),
                subtitle: t('system.senzaEmailQuestaPersonaNon', 'Senza email questa persona non potra recuperare la password da sola'),
                iconName: 'globe',
                tone: 'purple',
                definitions: CONTACT_FIELDS,
                values: draft,
                onInput
            }),
            fieldGroup({
                title: t('system.residenza', 'Residenza'),
                subtitle: t('system.facoltativaUtilePerLeVeri', 'Facoltativa, utile per le verifiche formali'),
                iconName: 'pin',
                tone: 'amber',
                definitions: ADDRESS_FIELDS,
                values: draft,
                onInput
            }),
            fieldGroup({
                title: t('system.posizioneNellOrganizzazione', 'Posizione nell organizzazione'),
                subtitle: t('system.mansioneERepartoPerCapire', 'Mansione e reparto, per capire chi ha fatto cosa'),
                iconName: 'tag',
                tone: 'cyan',
                definitions: WORK_FIELDS,
                values: draft,
                onInput
            }),
            card({
                title: t('system.preferenze', 'Preferenze'),
                subtitle: t('system.linguaDelleComunicazioniInd', 'Lingua delle comunicazioni indirizzate a questa persona'),
                iconName: 'settings',
                tone: 'emerald',
                body: [languageRow(draft.language, (value) => {
                    draft.language = value;
                    render();
                })]
            }),
            notificationCard({
                values: draft,
                onChange: (key, value) => {
                    draft[key] = value;
                    render();
                }
            })
        );
    };

    render();
    return host;
}
