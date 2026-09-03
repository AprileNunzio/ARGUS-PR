export const SettingType = Object.freeze({
    BOOLEAN: 'boolean',
    INTEGER: 'integer',
    ENUM: 'enum',
    TIME: 'time',
    DAYS: 'days',
    CIDR_LIST: 'cidrList',
    HOST_LIST: 'hostList'
});

export const RestartPolicy = Object.freeze({
    ASK: 'ask',
    WINDOW: 'window',
    IMMEDIATE: 'immediate'
});

export const GROUPS = Object.freeze([
    { id: 'updates', label: 'Aggiornamenti', icon: 'download' },
    { id: 'access', label: 'Accesso remoto', icon: 'globe' },
    { id: 'security', label: 'Sicurezza account', icon: 'shield' },
    { id: 'console', label: 'Console e muro video', icon: 'monitor' },
    { id: 'retention', label: 'Registrazione', icon: 'clock' }
]);

const definitions = [
    {
        key: 'updates.autoCheck',
        group: 'updates',
        label: 'Cerca aggiornamenti automaticamente',
        help: 'Controlla la presenza di nuove versioni all avvio e ogni sei ore. Non applica nulla da solo se la politica di riavvio non lo consente.',
        type: SettingType.BOOLEAN,
        default: true
    },
    {
        key: 'updates.restartPolicy',
        group: 'updates',
        label: 'Quando riavviare per applicare un aggiornamento',
        help: 'Chiedi conferma: il sistema segnala l aggiornamento e attende un comando esplicito. Finestra: applica da solo soltanto negli orari indicati. Subito: applica appena disponibile, interrompendo la registrazione per qualche secondo.',
        type: SettingType.ENUM,
        options: [
            { value: RestartPolicy.ASK, label: 'Chiedi sempre conferma' },
            { value: RestartPolicy.WINDOW, label: 'Solo nella finestra di manutenzione' },
            { value: RestartPolicy.IMMEDIATE, label: 'Subito, senza chiedere' }
        ],
        default: RestartPolicy.ASK
    },
    {
        key: 'updates.windowDays',
        group: 'updates',
        label: 'Giorni della finestra di manutenzione',
        help: 'Giorni in cui il riavvio automatico e consentito.',
        type: SettingType.DAYS,
        default: [0, 1, 2, 3, 4, 5, 6],
        dependsOn: { key: 'updates.restartPolicy', value: RestartPolicy.WINDOW }
    },
    {
        key: 'updates.windowStart',
        group: 'updates',
        label: 'Inizio finestra',
        help: 'Ora locale della macchina.',
        type: SettingType.TIME,
        default: '03:00',
        dependsOn: { key: 'updates.restartPolicy', value: RestartPolicy.WINDOW }
    },
    {
        key: 'updates.windowEnd',
        group: 'updates',
        label: 'Fine finestra',
        help: 'Se precede l orario di inizio, la finestra attraversa la mezzanotte.',
        type: SettingType.TIME,
        default: '05:00',
        dependsOn: { key: 'updates.restartPolicy', value: RestartPolicy.WINDOW }
    },
    {
        key: 'updates.minIntervalMinutes',
        group: 'updates',
        label: 'Intervallo minimo fra due tentativi',
        help: 'Freno di sicurezza contro i cicli di riavvio.',
        type: SettingType.INTEGER,
        minimum: 5,
        maximum: 1440,
        unit: 'minuti',
        default: 60
    },
    {
        key: 'access.publicAccess',
        group: 'access',
        label: 'Consenti la visione da internet',
        help: 'Da fuori la rete locale restano raggiungibili solo accesso, elenco telecamere e diretta. Nessuna funzione di configurazione, nessun account amministrativo.',
        type: SettingType.BOOLEAN,
        default: false,
        sensitive: true
    },
    {
        key: 'access.trustedNetworks',
        group: 'access',
        label: 'Reti trattate come locali',
        help: 'Reti in notazione CIDR che ottengono i privilegi della rete locale. E il posto della subnet WireGuard.',
        type: SettingType.CIDR_LIST,
        default: [],
        sensitive: true
    },
    {
        key: 'security.sessionTtlHours',
        group: 'security',
        label: 'Durata della sessione',
        help: 'Dopo questo tempo occorre autenticarsi di nuovo.',
        type: SettingType.INTEGER,
        minimum: 1,
        maximum: 168,
        unit: 'ore',
        default: 12
    },
    {
        key: 'security.lockoutSoftThreshold',
        group: 'security',
        label: 'Tentativi prima dell attesa progressiva',
        type: SettingType.INTEGER,
        minimum: 2,
        maximum: 10,
        default: 3
    },
    {
        key: 'security.lockoutHardThreshold',
        group: 'security',
        label: 'Tentativi prima del blocco prolungato',
        type: SettingType.INTEGER,
        minimum: 5,
        maximum: 50,
        default: 10
    },
    {
        key: 'security.lockoutBaseSeconds',
        group: 'security',
        label: 'Attesa iniziale',
        type: SettingType.INTEGER,
        minimum: 5,
        maximum: 600,
        unit: 'secondi',
        default: 30
    },
    {
        key: 'security.lockoutMaxSeconds',
        group: 'security',
        label: 'Attesa massima',
        type: SettingType.INTEGER,
        minimum: 60,
        maximum: 86400,
        unit: 'secondi',
        default: 1800
    },
    {
        key: 'console.metricsIntervalSeconds',
        group: 'console',
        label: 'Aggiornamento di CPU, RAM e GPU',
        type: SettingType.INTEGER,
        minimum: 1,
        maximum: 60,
        unit: 'secondi',
        default: 3
    },
    {
        key: 'console.gridColumns',
        group: 'console',
        label: 'Colonne del muro video',
        help: 'Zero lascia decidere al sistema in base al numero di telecamere attive.',
        type: SettingType.INTEGER,
        minimum: 0,
        maximum: 6,
        default: 0
    },
    {
        key: 'retention.days',
        group: 'retention',
        label: 'Giorni di conservazione delle registrazioni',
        type: SettingType.INTEGER,
        minimum: 1,
        maximum: 3650,
        unit: 'giorni',
        default: 30
    },
    {
        key: 'retention.eventDays',
        group: 'retention',
        label: 'Giorni di conservazione dei segmenti con evento',
        help: 'I filmati collegati a un rilevamento possono essere conservati piu a lungo.',
        type: SettingType.INTEGER,
        minimum: 1,
        maximum: 3650,
        unit: 'giorni',
        default: 90
    }
];

export const SETTINGS = Object.freeze(definitions.map((entry) => Object.freeze(entry)));

const byKey = new Map(SETTINGS.map((entry) => [entry.key, entry]));

export function definitionFor(key) {
    return byKey.get(key) ?? null;
}

export function defaults() {
    const values = {};
    for (const entry of SETTINGS) values[entry.key] = entry.default;
    return values;
}

export function keys() {
    return SETTINGS.map((entry) => entry.key);
}
