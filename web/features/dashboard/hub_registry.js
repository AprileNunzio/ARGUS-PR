export const MACRO_AREAS = [
    {
        id: 'surveillance',
        title: 'Videosorveglianza & Flussi',
        subtitle: 'Monitoraggio in tempo reale, streaming multi-camera e gestione dispositivi',
        icon: 'camera',
        color: 'blue',
        getMetric: (info) => `${info.cameraCount ?? 0} canali attivi · Streaming fMP4`,
        subapps: [
            { id: 'live', title: 'Diretta Live', desc: 'Visualizzatore ad altissima fluidità fMP4 su WebSocket', icon: 'play', route: 'live', badge: { text: 'Realtime', tone: 'green' } },
            { id: 'wall', title: 'Muro Video (Wall)', desc: 'Console perimetrale multi-telecamera a pieno schermo per monitor dedicati', icon: 'monitor', route: 'wall', isPage: true, badge: { text: 'Display', tone: 'blue' } },
            { id: 'cameras', title: 'Gestione Telecamere', desc: 'Rilevamento ONVIF, credenziali RTSP, profili e verifica canali', icon: 'camera', route: 'cameras', badge: { text: 'ONVIF', tone: 'blue' } }
        ]
    },
    {
        id: 'archive',
        title: 'Archivio & Registrazioni',
        subtitle: 'Registrazione continua 24/7, timeline ad alta velocità e catena di custodia',
        icon: 'archive',
        color: 'emerald',
        getMetric: () => 'Ritenzione automatica · Muxer H.264 MP4',
        subapps: [
            { id: 'archive_player', title: 'Riproduzione Filmati', desc: 'Navigatore cronologico con riproduzione Range e scrubbing', icon: 'play', route: 'archive', badge: { text: '24/7', tone: 'green' } },
            { id: 'timeline', title: 'Timeline Continua', desc: 'Controllo visuale dei segmenti orari e intervalli di registrazione', icon: 'timeline', route: 'archive', badge: { text: 'Eventi', tone: 'purple' } }
        ]
    },
    {
        id: 'vision',
        title: 'Visione AI & Analitiche',
        subtitle: 'Rilevamento oggetti, tracciamento biometrico delle persone e varchi ANPR',
        icon: 'sparkles',
        color: 'purple',
        getMetric: () => 'Modelli ONNX Accelerati · Visione Attiva',
        subapps: [
            { id: 'detections', title: 'Rilevamento Oggetti & Movimento', desc: 'Analisi persone, veicoli, animali e tracciamento traiettorie', icon: 'eye', route: 'detections', badge: { text: 'AI', tone: 'purple' } },
            { id: 'people', title: 'Riconoscimento Persone & Volti', desc: 'Galleria biometrica dei soggetti noti, dipendenti e visitatori', icon: 'users', route: 'people', badge: { text: 'Biometria', tone: 'blue' } },
            { id: 'access', title: 'Targhe & Controllo Varchi', desc: 'Lettura targhe (ANPR), whitelist veicoli e varchi automatici', icon: 'shield', route: 'access', badge: { text: 'ANPR', tone: 'green' } }
        ]
    },
    {
        id: 'security',
        title: 'Sicurezza Perimetrale & Firewall',
        subtitle: 'Difesa attiva ARGUS-SHIELD, autenticazione a due fattori e audit trail',
        icon: 'shield',
        color: 'amber',
        getMetric: () => 'Firewall Zero-Trust · Separazione LAN/WAN',
        subapps: [
            { id: 'shield', title: 'Firewall ARGUS-SHIELD', desc: 'Sorveglianza indirizzi IP, regole nftables perimetrali e banlist', icon: 'shield', route: 'settings', badge: { text: 'Firewall', tone: 'amber' } },
            { id: 'mfa', title: 'Autenticazione a Due Fattori (MFA)', desc: 'Protezione TOTP con codice a 6 cifre e codici di emergenza', icon: 'lock', route: 'settings', badge: { text: 'Critico', tone: 'red' } }
        ]
    },
    {
        id: 'system',
        title: 'Sistema, Hardware & Configurazione',
        subtitle: 'Telemetria delle risorse, aggiornamenti automatici e impostazioni dinamiche',
        icon: 'server',
        color: 'cyan',
        getMetric: (info) => `Node ${info.node ?? '24'} · ${info.platform ?? 'OS'}`,
        subapps: [
            { id: 'settings', title: 'Impostazioni Autogeneranti', desc: 'Configurazione centralizzata schema-driven a manifest', icon: 'settings', route: 'settings', badge: { text: 'Config', tone: 'blue' }, permission: 'system.manage' },
            { id: 'system', title: 'Telemetria & Manutenzione', desc: 'Grafici CPU/RAM/GPU, storage video e verifica del sistema', icon: 'activity', route: 'system', badge: { text: 'Hardware', tone: 'purple' }, permission: 'system.manage' }
        ]
    }
];

export function findRouteInfo(routeName) {
    for (const area of MACRO_AREAS) {
        const found = area.subapps.find((s) => s.route === routeName);
        if (found) return { area, subapp: found };
    }
    return null;
}
