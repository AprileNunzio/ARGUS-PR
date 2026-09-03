export const MACRO_AREAS = [
    {
        id: 'surveillance',
        title: 'Flussi Live',
        desc: 'Streaming e monitoraggio multi-canale',
        icon: 'camera',
        png: 'area_flussi',
        color: 'blue',
        getMetric: (info) => `${info.cameraCount ?? 0} canali attivi`,
        subapps: [
            { id: 'live', title: 'Diretta Streaming', desc: 'Flusso fMP4 realtime a bassissima latenza', icon: 'play', png: 'app_live', route: 'live', badge: { text: 'fMP4', tone: 'green' } },
            { id: 'wall', title: 'Muro Video (Wall)', desc: 'Console multiview a pieno schermo per monitor', icon: 'monitor', png: 'app_wall', route: 'wall', isPage: true, badge: { text: 'Display', tone: 'blue' } }
        ]
    },
    {
        id: 'archive',
        title: 'Registrazioni',
        desc: 'Archivio video 24/7 e timeline forense',
        icon: 'archive',
        png: 'area_registrazioni',
        color: 'emerald',
        getMetric: () => 'Ritenzione 24/7',
        subapps: [
            { id: 'archive_player', title: 'Filmati', desc: 'Riproduzione cronologica con Range scrubbing', icon: 'play', png: 'app_archive', route: 'archive', badge: { text: 'Archivio', tone: 'green' } },
            { id: 'timeline', title: 'Timeline Eventi', desc: 'Controllo visuale dei segmenti orari e prove', icon: 'timeline', png: 'app_timeline', route: 'archive', badge: { text: 'Eventi', tone: 'purple' } }
        ]
    },
    {
        id: 'vision',
        title: 'Visione AI',
        desc: 'Rilevamento oggetti, volti e targhe',
        icon: 'sparkles',
        png: 'area_visione',
        color: 'purple',
        getMetric: () => 'YOLO + SFace',
        subapps: [
            { id: 'detections', title: 'Rilevamenti', desc: 'Tracciamento persone, veicoli e animali', icon: 'eye', png: 'app_detections', route: 'detections', badge: { text: 'AI', tone: 'purple' } },
            { id: 'people', title: 'Volti Biometrici', desc: 'Iscrizione da foto e registro transiti', icon: 'users', png: 'app_people', route: 'people', badge: { text: 'Biometria', tone: 'blue' } },
            { id: 'access', title: 'Targhe & Varchi', desc: 'Riconoscimento ANPR e controllo accessi', icon: 'shield', png: 'app_access', route: 'access', badge: { text: 'ANPR', tone: 'green' } }
        ]
    },
    {
        id: 'security',
        title: 'Sicurezza',
        desc: 'Firewall perimetrale e protezione accessi',
        icon: 'shield',
        png: 'area_sicurezza',
        color: 'amber',
        getMetric: () => 'Zero-Trust',
        subapps: [
            { id: 'automation', title: 'Automazioni', desc: 'Notifiche, email, webhook, MQTT e apertura varchi', icon: 'zap', png: 'app_shield', route: 'automation', badge: { text: 'Regole', tone: 'amber' }, permission: 'alarm.manage' },
            { id: 'shield', title: 'Firewall ARGUS-SHIELD', desc: 'Sorveglianza indirizzi IP e blocco attacchi', icon: 'shield', png: 'app_shield', route: 'settings', badge: { text: 'Shield', tone: 'amber' } },
            { id: 'mfa', title: 'Autenticazione MFA', desc: 'Protezione TOTP con codici di sicurezza', icon: 'lock', png: 'app_mfa', route: 'settings', badge: { text: 'TOTP', tone: 'red' } }
        ]
    },
    {
        id: 'system',
        title: 'Sistema',
        desc: 'Configurazione autonoma e telemetria',
        icon: 'server',
        png: 'area_sistema',
        color: 'cyan',
        getMetric: (info) => `v${info.version ?? '0.18.3'}`,
        subapps: [
            { id: 'cameras', title: 'Telecamere', desc: 'Canali di rete e USB, parametri, orari e zone', icon: 'camera', png: 'app_cameras', route: 'cameras', badge: { text: 'Canali', tone: 'blue' }, permission: 'camera.manage' },
            { id: 'settings', title: 'Impostazioni', desc: 'Pannello schema-driven autogenerante', icon: 'settings', png: 'app_settings', route: 'settings', badge: { text: 'Config', tone: 'blue' }, permission: 'system.manage' },
            { id: 'system', title: 'Telemetria', desc: 'Monitoraggio CPU, RAM, storage e rete', icon: 'activity', png: 'app_telemetry', route: 'system', badge: { text: 'Hardware', tone: 'purple' }, permission: 'system.manage' }
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
