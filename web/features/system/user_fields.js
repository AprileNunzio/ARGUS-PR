import { el } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, toggle, optionRow, segmented } from '/assets/ui.js';

export const IDENTITY_FIELDS = [
    { key: 'firstName', label: 'Nome', hint: 'Come compare nei registri e nelle notifiche', autocomplete: 'given-name' },
    { key: 'lastName', label: 'Cognome', hint: 'Serve a distinguere persone con lo stesso nome', autocomplete: 'family-name' },
    { key: 'birthDate', label: 'Data di nascita', hint: 'Formato AAAA-MM-GG', type: 'date' },
    { key: 'birthPlace', label: 'Luogo di nascita', hint: 'Comune e provincia' },
    { key: 'taxCode', label: 'Codice fiscale', hint: 'Facoltativo, utile per il riconoscimento formale' }
];

export const CONTACT_FIELDS = [
    { key: 'email', label: 'Email', hint: 'Unica per ogni utente: e la casella che riceve il recupero della password', type: 'email', autocomplete: 'email' },
    { key: 'phone', label: 'Cellulare', hint: 'Con prefisso internazionale, esempio +39 333 1234567', type: 'tel' },
    { key: 'emergencyContact', label: 'Contatto di emergenza', hint: 'Nome della persona da avvisare' },
    { key: 'emergencyPhone', label: 'Telefono di emergenza', hint: 'Numero della persona da avvisare', type: 'tel' }
];

export const ADDRESS_FIELDS = [
    { key: 'address', label: 'Indirizzo di residenza', hint: 'Via e numero civico', autocomplete: 'street-address' },
    { key: 'city', label: 'Citta', hint: 'Comune di residenza' },
    { key: 'province', label: 'Provincia', hint: 'Sigla o nome esteso' },
    { key: 'postalCode', label: 'CAP', hint: 'Codice di avviamento postale' },
    { key: 'country', label: 'Nazione', hint: 'Italia, se non indicato diversamente' }
];

export const WORK_FIELDS = [
    { key: 'jobTitle', label: 'Mansione', hint: 'Ruolo svolto nell organizzazione' },
    { key: 'department', label: 'Reparto', hint: 'Area o sede di appartenenza' }
];

export const LANGUAGES = [
    { value: 'it', label: 'Italiano', icon: 'globe' },
    { value: 'en', label: 'English', icon: 'globe' },
    { value: 'fr', label: 'Francais', icon: 'globe' },
    { value: 'de', label: 'Deutsch', icon: 'globe' },
    { value: 'es', label: 'Espanol', icon: 'globe' }
];

export const NOTIFICATIONS = [
    { key: 'notifyEmail', label: 'Email di servizio', hint: 'Comunicazioni operative dirette a questa persona', icon: 'globe' },
    { key: 'notifyAlarm', label: 'Allarmi e rilevamenti', hint: 'Ogni evento che il sistema classifica come allarme', icon: 'alarm' },
    { key: 'notifySystem', label: 'Avvisi di sistema', hint: 'Dischi pieni, aggiornamenti, telecamere irraggiungibili', icon: 'activity' },
    { key: 'notifyDigest', label: 'Riepilogo giornaliero', hint: 'Un solo messaggio al giorno con il quadro completo', icon: 'timeline' }
];

export function textField(definition, value, onInput) {
    const input = el('input', {
        className: 'input',
        type: definition.type ?? 'text',
        value: value ?? '',
        autocomplete: definition.autocomplete ?? 'off',
        placeholder: definition.hint
    });

    input.addEventListener('input', () => onInput(definition.key, input.value));

    return el('div', { className: 'field' }, [
        el('label', { textContent: definition.label }),
        input,
        el('span', { className: 'field__hint', textContent: definition.hint })
    ]);
}

export function fieldGroup({ title, subtitle, iconName, tone, definitions, values, onInput, badge = null }) {
    return card({
        title,
        subtitle,
        iconName,
        tone,
        badge,
        body: [
            el('div', { className: 'grid grid--fields' }, definitions.map((definition) => textField(definition, values[definition.key], onInput)))
        ]
    });
}

export function notificationCard({ values, onChange, badge = null }) {
    return card({
        title: 'Notifiche',
        subtitle: 'Cosa deve ricevere questa persona. Le email partono dal server SMTP configurato nelle automazioni',
        iconName: 'alarm',
        tone: 'amber',
        badge,
        body: NOTIFICATIONS.map((entry) => optionRow({
            title: entry.label,
            hint: entry.hint,
            iconName: entry.icon,
            control: toggle(values[entry.key] === true, (value) => onChange(entry.key, value), ['Attive', 'Spente'])
        }))
    });
}

export function languageRow(value, onChange) {
    return optionRow({
        title: 'Lingua preferita',
        hint: 'Usata nelle comunicazioni indirizzate a questa persona',
        iconName: 'globe',
        control: segmented(LANGUAGES, value ?? 'it', onChange, { compact: true })
    });
}

export function roleRow(roles, value, onChange, { disabled = false } = {}) {
    const options = roles.map((role) => ({
        value: role.id,
        label: role.id === 'admin' ? 'Amministratore' : role.id === 'operator' ? 'Operatore' : 'Osservatore',
        icon: role.id === 'admin' ? 'shield' : role.id === 'operator' ? 'users' : 'eye',
        hint: role.description
    }));

    return optionRow({
        title: 'Ruolo e permessi',
        hint: disabled
            ? 'Il ruolo del proprio account non si modifica da qui, per non restare fuori dal sistema'
            : 'Il ruolo decide cosa questa persona puo vedere e toccare, senza eccezioni',
        iconName: 'shield',
        control: disabled
            ? el('span', { className: 'chip chip--info', textContent: options.find((entry) => entry.value === value)?.label ?? value })
            : segmented(options, value, onChange, { compact: true })
    });
}

export function permissionList(permissions) {
    return el('div', { className: 'row row--tight row--wrap' }, (permissions ?? []).map((permission) => el('span', {
        className: 'chip chip--info'
    }, [icon('lock'), el('span', { textContent: permission })])));
}
