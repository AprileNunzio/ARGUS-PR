export const MACRO_AREAS = [
    {
        id: 'surveillance',
        title: 'Flussi Live',
        desc: 'Streaming e monitoraggio multi-canale',
        icon: 'camera',
        color: 'blue',
        getMetric: (info) => `${info.cameraCount ?? 0} canali attivi`,
        subapps: [
            { id: 'live', title: 'Diretta Streaming', desc: 'Flusso fMP4 realtime a bassissima latenza', icon: 'play', route: 'live', badge: { text: 'fMP4', tone: 'green' } },
            { id: 'wall', title: 'Muro Video (Wall)', desc: 'Console multiview a pieno schermo per monitor', icon: 'monitor', route: 'wall', isPage: true, badge: { text: 'Display', tone: 'blue' } },
            { id: 'cameras', title: 'Telecamere', desc: 'Rilevamento ONVIF e gestione flussi RTSP', icon: 'camera', route: 'cameras', badge: { text: 'ONVIF', tone: 'blue' } }
        ]
    },
    {
        id: 'archive',
        title: 'Registrazioni',
        desc: 'Archivio video 24/7 e timeline forense',
        icon: 'archive',
        color: 'emerald',
        getMetric: () => 'Ritenzione 24/7',
        subapps: [
            { id: 'archive_player', title: 'Filmati', desc: 'Riproduzione cronologica con Range scrubbing', icon: 'play', route: 'archive', badge: { text: 'Archivio', tone: 'green' } },
            { id: 'timeline', title: 'Timeline Eventi', desc: 'Controllo visuale dei segmenti orari e prove', icon: 'timeline', route: 'archive', badge: { text: 'Eventi', tone: 'purple' } }
        ]
    },
    {
        id: 'vision',
        title: 'Visione AI',
        desc: 'Rilevamento oggetti, volti e targhe',
        icon: 'sparkles',
        color: 'purple',
        getMetric: () => 'YOLO + SFace',
        subapps: [
            { id: 'detections', title: 'Rilevamenti', desc: 'Tracciamento persone, veicoli e animali', icon: 'eye', route: 'detections', badge: { text: 'AI', tone: 'purple' } },
            { id: 'people', title: 'Volti Biometrici', desc: 'Iscrizione da foto e registro transiti', icon: 'users', route: 'people', badge: { text: 'Biometria', tone: 'blue' } },
            { id: 'access', title: 'Targhe & Varchi', desc: 'Riconoscimento ANPR e controllo accessi', icon: 'shield', route: 'access', badge: { text: 'ANPR', tone: 'green' } }
        ]
    },
    {
        id: 'security',
        title: 'Sicurezza',
        desc: 'Firewall perimetrale e protezione accessi',
        icon: 'shield',
        color: 'amber',
        getMetric: () => 'Zero-Trust',
        subapps: [
            { id: 'shield', title: 'Firewall ARGUS-SHIELD', desc: 'Sorveglianza indirizzi IP e blocco attacchi', icon: 'shield', route: 'settings', badge: { text: 'Shield', tone: 'amber' } },
            { id: 'mfa', title: 'Autenticazione MFA', desc: 'Protezione TOTP con codici di sicurezza', icon: 'lock', route: 'settings', badge: { text: 'TOTP', tone: 'red' } }
        ]
    },
    {
        id: 'system',
        title: 'Sistema',
        desc: 'Configurazione autonoma e telemetria',
        icon: 'server',
        color: 'cyan',
        getMetric: (info) => `v${info.version ?? '0.15.0'}`,
        subapps: [
            { id: 'settings', title: 'Impostazioni', desc: 'Pannello schema-driven autogenerante', icon: 'settings', route: 'settings', badge: { text: 'Config', tone: 'blue' }, permission: 'system.manage' },
            { id: 'system', title: 'Telemetria', desc: 'Monitoraggio CPU, RAM, storage e rete', icon: 'activity', route: 'system', badge: { text: 'Hardware', tone: 'purple' }, permission: 'system.manage' }
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
