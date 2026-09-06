const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const PHONE = /^\+?[0-9 ().-]{6,24}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TAX_CODE = /^[A-Za-z0-9]{5,20}$/;
const POSTAL = /^[A-Za-z0-9 -]{3,12}$/;
const LANGUAGES = Object.freeze(['it', 'en', 'fr', 'de', 'es']);

export const TEXT_FIELDS = Object.freeze({
    firstName: { column: 'first_name', label: 'Nome', max: 60 },
    lastName: { column: 'last_name', label: 'Cognome', max: 60 },
    birthPlace: { column: 'birth_place', label: 'Luogo di nascita', max: 80 },
    address: { column: 'address', label: 'Indirizzo di residenza', max: 120 },
    city: { column: 'city', label: 'Citta', max: 80 },
    province: { column: 'province', label: 'Provincia', max: 40 },
    country: { column: 'country', label: 'Nazione', max: 60 },
    jobTitle: { column: 'job_title', label: 'Ruolo aziendale', max: 80 },
    department: { column: 'department', label: 'Reparto', max: 80 },
    emergencyContact: { column: 'emergency_contact', label: 'Contatto di emergenza', max: 80 },
    notes: { column: 'notes', label: 'Note', max: 500 }
});

export const NOTIFICATION_FIELDS = Object.freeze({
    notifyEmail: { column: 'notify_email', label: 'Email di servizio' },
    notifyAlarm: { column: 'notify_alarm', label: 'Allarmi e rilevamenti' },
    notifySystem: { column: 'notify_system', label: 'Avvisi di sistema' },
    notifyDigest: { column: 'notify_digest', label: 'Riepilogo giornaliero' }
});

function trimmed(value) {
    return typeof value === 'string' ? value.trim() : '';
}

export function normaliseEmail(value) {
    const email = trimmed(value).toLowerCase();
    if (email.length === 0) return null;
    if (email.length > 160 || !EMAIL.test(email)) throw new Error('Indirizzo email non valido');
    return email;
}

export function normalisePhone(value, label = 'Numero di telefono') {
    const phone = trimmed(value).replace(/\s+/g, ' ');
    if (phone.length === 0) return null;
    if (!PHONE.test(phone)) throw new Error(`${label} non valido`);
    return phone;
}

export function normaliseBirthDate(value) {
    const date = trimmed(value);
    if (date.length === 0) return null;
    if (!DATE.test(date)) throw new Error('Data di nascita non valida: usa il formato AAAA-MM-GG');

    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) throw new Error('Data di nascita inesistente');
    if (parsed.getTime() > Date.now()) throw new Error('La data di nascita non puo essere nel futuro');
    if (parsed.getUTCFullYear() < 1900) throw new Error('Data di nascita troppo remota');

    return date;
}

export function normaliseTaxCode(value) {
    const code = trimmed(value).toUpperCase();
    if (code.length === 0) return null;
    if (!TAX_CODE.test(code)) throw new Error('Codice fiscale non valido');
    return code;
}

export function normalisePostalCode(value) {
    const code = trimmed(value).toUpperCase();
    if (code.length === 0) return null;
    if (!POSTAL.test(code)) throw new Error('CAP non valido');
    return code;
}

export function normaliseLanguage(value) {
    const language = trimmed(value).toLowerCase();
    if (language.length === 0) return 'it';
    if (!LANGUAGES.includes(language)) throw new Error('Lingua non supportata');
    return language;
}

function normaliseText(value, { label, max }) {
    const text = trimmed(value);
    if (text.length === 0) return null;
    if (text.length > max) throw new Error(`${label}: massimo ${max} caratteri`);
    return text;
}

export function sanitiseProfile(body = {}, { partial = false } = {}) {
    const patch = {};

    for (const [key, definition] of Object.entries(TEXT_FIELDS)) {
        if (partial && body[key] === undefined) continue;
        patch[definition.column] = normaliseText(body[key], definition);
    }

    if (!partial || body.email !== undefined) patch.email = normaliseEmail(body.email);
    if (!partial || body.phone !== undefined) patch.phone = normalisePhone(body.phone);
    if (!partial || body.emergencyPhone !== undefined) {
        patch.emergency_phone = normalisePhone(body.emergencyPhone, 'Telefono di emergenza');
    }
    if (!partial || body.birthDate !== undefined) patch.birth_date = normaliseBirthDate(body.birthDate);
    if (!partial || body.taxCode !== undefined) patch.tax_code = normaliseTaxCode(body.taxCode);
    if (!partial || body.postalCode !== undefined) patch.postal_code = normalisePostalCode(body.postalCode);
    if (!partial || body.language !== undefined) patch.language = normaliseLanguage(body.language);

    for (const [key, definition] of Object.entries(NOTIFICATION_FIELDS)) {
        if (partial && body[key] === undefined) continue;
        patch[definition.column] = body[key] === true || body[key] === 1 ? 1 : 0;
    }

    return patch;
}

export function fullName(row) {
    const parts = [row?.first_name, row?.last_name].filter((entry) => typeof entry === 'string' && entry.length > 0);
    return parts.length > 0 ? parts.join(' ') : null;
}

export function profileCompleteness(row) {
    const wanted = ['first_name', 'last_name', 'email', 'phone', 'birth_date', 'address', 'city', 'postal_code'];
    const filled = wanted.filter((column) => typeof row?.[column] === 'string' && row[column].length > 0);
    return Math.round((filled.length / wanted.length) * 100);
}
