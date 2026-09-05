import { el } from '/assets/dom.js';
import {
    IDENTITY_FIELDS,
    CONTACT_FIELDS,
    ADDRESS_FIELDS,
    textField
} from '/features/system/user_fields.js';

const REQUIRED = ['firstName', 'lastName', 'email'];

export function profileStep({ state }) {
    const feedback = el('div', { className: 'notice notice--warn', hidden: 'hidden' });

    const onInput = (key, value) => {
        state.profile[key] = value;
    };

    const deviceInput = el('input', {
        className: 'input',
        value: state.deviceLabel ?? '',
        placeholder: 'Esempio: Sede Centrale, Magazzino Nord'
    });

    deviceInput.addEventListener('input', () => {
        state.deviceLabel = deviceInput.value;
    });

    const group = (title, hint, definitions) => el('section', { className: 'stack' }, [
        el('h3', { className: 'setup-section__title', textContent: title }),
        el('p', { className: 'setup-section__hint', textContent: hint }),
        el('div', { className: 'grid grid--fields' }, definitions.map((definition) => textField(definition, state.profile[definition.key], onInput)))
    ]);

    return {
        title: 'Chi sei',
        summary: 'Anagrafica e recapiti dell amministratore',
        body: el('div', { className: 'stack' }, [
            el('p', {
                className: 'setup-section__hint',
                textContent: 'Nome, cognome ed email sono obbligatori: senza email nessuno potra recuperare la password di questo account, e sarebbe l unico amministratore.'
            }),
            feedback,
            group('Anagrafica', 'Serve a identificare con certezza chi governa l impianto.', IDENTITY_FIELDS),
            group('Recapiti', 'L email riceve il recupero della password e le comunicazioni di servizio.', CONTACT_FIELDS),
            group('Residenza', 'Facoltativa, utile per le verifiche formali.', ADDRESS_FIELDS),
            el('section', { className: 'stack' }, [
                el('h3', { className: 'setup-section__title', textContent: 'Nome di questo impianto' }),
                el('p', {
                    className: 'setup-section__hint',
                    textContent: 'Compare fra parentesi nell app di autenticazione, accanto alla tua email, cosi riconosci subito quale impianto stai sbloccando quando ne gestisci piu di uno.'
                }),
                el('div', { className: 'field' }, [
                    el('label', { textContent: 'Nome dell impianto' }),
                    deviceInput,
                    el('span', { className: 'field__hint', textContent: 'Facoltativo: senza, resta solo il codice breve generato dal sistema' })
                ])
            ])
        ]),
        validate() {
            const missing = REQUIRED.filter((key) => String(state.profile[key] ?? '').trim().length === 0);

            if (missing.length > 0) {
                feedback.textContent = 'Compila nome, cognome ed email prima di proseguire.';
                feedback.removeAttribute('hidden');
                return false;
            }

            feedback.setAttribute('hidden', 'hidden');
            return true;
        }
    };
}
