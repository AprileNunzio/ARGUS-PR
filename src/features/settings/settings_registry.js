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

const registry = new Map();
const customGroups = [];

const BUILTIN_MANIFESTS = [
    {
        group: {
            id: 'updates',
            label: 'Aggiornamenti & Manutenzione',
            subtitle: 'Canale di release, frequenza di ricerca e politica di riavvio automatico',
            icon: 'download',
            color: 'blue',
            sections: [
                { id: 'search', label: 'Rilevamento e Ricerca', icon: 'search' },
                { id: 'restart', label: 'Politica di Riavvio e Finestra', icon: 'clock' },
                { id: 'safety', label: 'Freni di Sicurezza', icon: 'shield' }
            ]
        },
        settings: [
            {
                key: 'updates.autoCheck',
                group: 'updates',
                section: 'search',
                label: 'Cerca aggiornamenti automaticamente',
                help: 'Controlla la presenza di nuove versioni all avvio e ogni sei ore. Non applica nulla da solo se la politica di riavvio non lo consente.',
                type: SettingType.BOOLEAN,
                component: 'switch',
                badge: { text: 'Consigliato', tone: 'green' },
                default: true
            },
            {
                key: 'updates.restartPolicy',
                group: 'updates',
                section: 'restart',
                label: 'Quando riavviare per applicare un aggiornamento',
                help: 'Chiedi conferma: il sistema segnala l aggiornamento e attende un comando esplicito. Finestra: applica da solo soltanto negli orari indicati. Subito: applica appena disponibile, interrompendo la registrazione per qualche secondo.',
                type: SettingType.ENUM,
                component: 'segmented',
                options: [
                    { value: RestartPolicy.ASK, label: 'Chiedi conferma', icon: 'info' },
                    { value: RestartPolicy.WINDOW, label: 'In finestra', icon: 'clock' },
                    { value: RestartPolicy.IMMEDIATE, label: 'Subito', icon: 'zap' }
                ],
                default: RestartPolicy.ASK
            },
            {
                key: 'updates.windowDays',
                group: 'updates',
                section: 'restart',
                label: 'Giorni della finestra di manutenzione',
                help: 'Giorni settimanali in cui il riavvio automatico e consentito.',
                type: SettingType.DAYS,
                component: 'days',
                badge: { text: 'Finestra', tone: 'blue' },
                default: [0, 1, 2, 3, 4, 5, 6],
                dependsOn: { key: 'updates.restartPolicy', value: RestartPolicy.WINDOW }
            },
            {
                key: 'updates.windowStart',
                group: 'updates',
                section: 'restart',
                label: 'Inizio finestra manutenzione',
                help: 'Ora locale della macchina per l inizio della finestra.',
                type: SettingType.TIME,
                component: 'time',
                default: '03:00',
                dependsOn: { key: 'updates.restartPolicy', value: RestartPolicy.WINDOW }
            },
            {
                key: 'updates.windowEnd',
                group: 'updates',
                section: 'restart',
                label: 'Fine finestra manutenzione',
                help: 'Se precede l orario di inizio, la finestra attraversa la mezzanotte.',
                type: SettingType.TIME,
                component: 'time',
                default: '05:00',
                dependsOn: { key: 'updates.restartPolicy', value: RestartPolicy.WINDOW }
            },
            {
                key: 'updates.minIntervalMinutes',
                group: 'updates',
                section: 'safety',
                label: 'Intervallo minimo fra tentativi',
                help: 'Freno di sicurezza per prevenire cicli continui di riavvio.',
                type: SettingType.INTEGER,
                component: 'slider',
                minimum: 5,
                maximum: 1440,
                step: 5,
                unit: 'minuti',
                badge: { text: 'Anti-loop', tone: 'amber' },
                default: 60
            }
        ]
    },
    {
        group: {
            id: 'access',
            label: 'Accesso Remoto & Reti',
            subtitle: 'Controllo perimetrale di rete, esposizione internet e subnet fidate',
            icon: 'globe',
            color: 'cyan',
            sections: [
                { id: 'wan', label: 'Esposizione Esterna (WAN)', icon: 'globe' },
                { id: 'lan', label: 'Reti Locali e Subnet Fidate', icon: 'network' }
            ]
        },
        settings: [
            {
                key: 'access.publicAccess',
                group: 'access',
                section: 'wan',
                label: 'Consenti la visione da internet',
                help: 'Da fuori la rete locale restano raggiungibili solo accesso, elenco telecamere e diretta. Nessuna funzione di configurazione, nessun account amministrativo.',
                type: SettingType.BOOLEAN,
                component: 'switch',
                badge: { text: 'Sensibile', tone: 'amber' },
                default: false,
                sensitive: true
            },
            {
                key: 'access.trustedNetworks',
                group: 'access',
                section: 'lan',
                label: 'Reti trattate come locali',
                help: 'Reti in notazione CIDR che ottengono i privilegi della rete locale (es. subnet WireGuard o VPN aziendale).',
                type: SettingType.CIDR_LIST,
                component: 'tags',
                badge: { text: 'CIDR', tone: 'blue' },
                default: [],
                sensitive: true
            }
        ]
    },
    {
        group: {
            id: 'security',
            label: 'Sicurezza Account & Protezione',
            subtitle: 'Durata delle sessioni, criteri di blocco e protezione brute-force',
            icon: 'shield',
            color: 'amber',
            sections: [
                { id: 'mfa', label: 'Autenticazione a Due Fattori (MFA)', icon: 'lock' },
                { id: 'sessions', label: 'Sessioni e Token', icon: 'users' },
                { id: 'lockout', label: 'Protezione Attacchi e Blocco', icon: 'alarm' }
            ]
        },
        settings: [
            {
                key: 'security.mfaRequiredForAdmin',
                group: 'security',
                section: 'mfa',
                label: 'MFA obbligatoria per amministratori',
                help: 'Impone l attivazione del secondo fattore TOTP per gli account con privilegi amministrativi.',
                type: SettingType.BOOLEAN,
                component: 'switch',
                badge: { text: 'Critico', tone: 'red' },
                default: true
            },
            {
                key: 'security.sessionTtlHours',
                group: 'security',
                section: 'sessions',
                label: 'Durata massima della sessione',
                help: 'Scaduto questo intervallo, l operatore deve autenticarsi nuovamente.',
                type: SettingType.INTEGER,
                component: 'slider',
                minimum: 1,
                maximum: 168,
                step: 1,
                unit: 'ore',
                default: 12
            },
            {
                key: 'security.lockoutSoftThreshold',
                group: 'security',
                section: 'lockout',
                label: 'Tentativi prima dell attesa progressiva',
                help: 'Numero di fallimenti consecutivi prima di rallentare i tentativi.',
                type: SettingType.INTEGER,
                component: 'stepper',
                minimum: 2,
                maximum: 10,
                step: 1,
                unit: 'tentativi',
                default: 3
            },
            {
                key: 'security.lockoutHardThreshold',
                group: 'security',
                section: 'lockout',
                label: 'Tentativi prima del blocco prolungato',
                help: 'Numero di fallimenti consecutivi prima del blocco completo dell account.',
                type: SettingType.INTEGER,
                component: 'stepper',
                minimum: 5,
                maximum: 50,
                step: 1,
                unit: 'tentativi',
                default: 10
            },
            {
                key: 'security.lockoutBaseSeconds',
                group: 'security',
                section: 'lockout',
                label: 'Attesa iniziale di blocco',
                help: 'Secondi di ritardo applicati al primo scatto dell attesa progressiva.',
                type: SettingType.INTEGER,
                component: 'slider',
                minimum: 5,
                maximum: 600,
                step: 5,
                unit: 'secondi',
                default: 30
            },
            {
                key: 'security.lockoutMaxSeconds',
                group: 'security',
                section: 'lockout',
                label: 'Attesa massima di blocco',
                help: 'Tetto massimo di secondi per la progressione esponenziale del blocco.',
                type: SettingType.INTEGER,
                component: 'slider',
                minimum: 60,
                maximum: 86400,
                step: 60,
                unit: 'secondi',
                default: 1800
            }
        ]
    },
    {
        group: {
            id: 'console',
            label: 'Console & Muro Video',
            subtitle: 'Opzioni del display locale a schermo intero e kiosk HDMI',
            icon: 'monitor',
            color: 'rose',
            sections: [
                { id: 'metrics', label: 'Monitoraggio Risorse Hardware', icon: 'cpu' },
                { id: 'layout', label: 'Griglia Visualizzazione', icon: 'grid' }
            ]
        },
        settings: [
            {
                key: 'console.metricsIntervalSeconds',
                group: 'console',
                section: 'metrics',
                label: 'Frequenza telemetria CPU, RAM e GPU',
                help: 'Intervallo di aggiornamento dei grafici delle risorse di sistema.',
                type: SettingType.INTEGER,
                component: 'slider',
                minimum: 1,
                maximum: 60,
                step: 1,
                unit: 'secondi',
                badge: { text: 'Hardware', tone: 'purple' },
                default: 3
            },
            {
                key: 'console.gridColumns',
                group: 'console',
                section: 'layout',
                label: 'Colonne della griglia telecamere',
                help: 'Zero adatta automaticamente le colonne al numero di flussi attivi.',
                type: SettingType.INTEGER,
                component: 'segmented',
                minimum: 0,
                maximum: 6,
                options: [
                    { value: 0, label: 'Auto' },
                    { value: 1, label: '1' },
                    { value: 2, label: '2' },
                    { value: 3, label: '3' },
                    { value: 4, label: '4' }
                ],
                default: 0
            }
        ]
    },
    {
        group: {
            id: 'retention',
            label: 'Registrazione & Archiviazione',
            subtitle: 'Politiche di ritenzione dei filmati, quote disco e pulizia',
            icon: 'clock',
            color: 'emerald',
            sections: [
                { id: 'general', label: 'Ritenzione Ordinaria', icon: 'clock' },
                { id: 'events', label: 'Segmenti con Rilevamento', icon: 'sparkles' }
            ]
        },
        settings: [
            {
                key: 'retention.days',
                group: 'retention',
                section: 'general',
                label: 'Giorni di conservazione continuativa',
                help: 'Giorni dopo i quali i filmati ordinari vengono eliminati automaticamente.',
                type: SettingType.INTEGER,
                component: 'slider',
                minimum: 1,
                maximum: 3650,
                step: 1,
                unit: 'giorni',
                default: 30
            },
            {
                key: 'retention.eventDays',
                group: 'retention',
                section: 'events',
                label: 'Conservazione filmati con eventi AI',
                help: 'I segmenti associati a persone, veicoli o varchi possono essere conservati piu a lungo.',
                type: SettingType.INTEGER,
                component: 'slider',
                minimum: 1,
                maximum: 3650,
                step: 1,
                unit: 'giorni',
                badge: { text: 'Prioritario', tone: 'purple' },
                default: 90
            }
        ]
    }
];

for (const manifest of BUILTIN_MANIFESTS) {
    customGroups.push(manifest.group);
    for (const setting of manifest.settings) {
        registry.set(setting.key, setting);
    }
}

export function registerFeatureManifest(manifest) {
    if (!manifest || !manifest.group || !Array.isArray(manifest.settings)) return;
    const existingIdx = customGroups.findIndex((g) => g.id === manifest.group.id);
    if (existingIdx >= 0) customGroups[existingIdx] = manifest.group;
    else customGroups.push(manifest.group);

    for (const setting of manifest.settings) {
        registry.set(setting.key, setting);
    }
}

export function getAllGroups() {
    return customGroups.map((g) => ({ ...g }));
}

export function getAllSettings() {
    return Array.from(registry.values()).map((s) => ({ ...s }));
}

export function getSettingDefinition(key) {
    return registry.get(key) ?? null;
}
