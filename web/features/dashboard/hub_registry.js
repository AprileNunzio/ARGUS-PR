import { t } from '/assets/i18n.js';
export const MACRO_AREAS = [
    {
        id: 'surveillance',
        title: t('dashboard.flussiLive', 'Flussi Live'),
        desc: 'Streaming e monitoraggio multi-canale',
        icon: 'camera',
        png: 'area_flussi',
        color: 'blue',
        getMetric: (info) => `${info.cameraCount ?? 0} canali attivi`,
        subapps: [
            { id: 'live', title: t('dashboard.direttaStreaming', 'Diretta Streaming'), desc: 'Flusso fMP4 realtime a bassissima latenza', icon: 'play', png: 'app_live', route: 'live', badge: { text: 'fMP4', tone: 'green' } },
            { id: 'wall', title: t('dashboard.muroVideoWall', 'Muro Video (Wall)'), desc: 'Console multiview a pieno schermo per monitor', icon: 'monitor', png: 'app_wall', route: 'wall', isPage: true, badge: { text: 'Display', tone: 'blue' } },
            { id: 'wall-settings', title: t('dashboard.regiaLayoutMuro', 'Regia & Layout Muro'), desc: 'Griglia predefinita, riquadri, qualita flussi, uscite HDMI e orologio', icon: 'crop', png: 'app_wall', route: 'wall-settings', badge: { text: 'Regia', tone: 'purple' }, permission: 'system.manage' },
            { id: 'floorplan', title: t('dashboard.mappaPlanimetria', 'Mappa Planimetria'), desc: 'Mappa interattiva e coni visivi delle telecamere', icon: 'crop', png: 'app_cameras', route: 'floorplan', badge: { text: '2D', tone: 'cyan' } }
        ]
    },
    {
        id: 'archive',
        title: t('dashboard.registrazioni', 'Registrazioni'),
        desc: 'Archivio video 24/7 e timeline forense',
        icon: 'archive',
        png: 'area_registrazioni',
        color: 'emerald',
        getMetric: () => 'Ritenzione 24/7',
        subapps: [
            { id: 'archive_player', title: t('dashboard.filmati', 'Filmati'), desc: 'Riproduzione cronologica con Range scrubbing', icon: 'play', png: 'app_archive', route: 'archive', badge: { text: 'Archivio', tone: 'green' } },
            { id: 'timeline', title: t('dashboard.timelineEventi', 'Timeline Eventi'), desc: 'Controllo visuale dei segmenti orari e prove', icon: 'timeline', png: 'app_timeline', route: 'archive', badge: { text: 'Eventi', tone: 'purple' } }
        ]
    },
    {
        id: 'vision',
        title: t('dashboard.visioneAI', 'Visione AI'),
        desc: 'Rilevamento oggetti, volti e targhe',
        icon: 'sparkles',
        png: 'area_visione',
        color: 'purple',
        getMetric: () => 'YOLO + SFace',
        subapps: [
            { id: 'detections', title: t('dashboard.rilevamenti', 'Rilevamenti'), desc: 'Tracciamento persone, veicoli e animali', icon: 'eye', png: 'app_detections', route: 'detections', badge: { text: 'AI', tone: 'purple' } },
            { id: 'people', title: t('dashboard.voltiBiometrici', 'Volti Biometrici'), desc: 'Iscrizione da foto e registro transiti', icon: 'users', png: 'app_people', route: 'people', badge: { text: 'Biometria', tone: 'blue' } },
            { id: 'access', title: t('dashboard.targheVarchi', 'Targhe & Varchi'), desc: 'Riconoscimento ANPR e controllo accessi', icon: 'shield', png: 'app_access', route: 'access', badge: { text: 'ANPR', tone: 'green' } }
        ]
    },
    {
        id: 'security',
        title: t('dashboard.sicurezza', 'Sicurezza'),
        desc: 'Firewall perimetrale e protezione accessi',
        icon: 'shield',
        png: 'area_sicurezza',
        color: 'amber',
        getMetric: () => 'Zero-Trust',
        subapps: [
            { id: 'users', title: t('dashboard.utentiPermessiRBAC', 'Utenti & Permessi RBAC'), desc: 'Profili operatori, ruoli e permessi di controllo accessi', icon: 'users', png: 'app_people', route: 'users', badge: { text: 'RBAC', tone: 'blue' }, permission: 'user.manage' },
            { id: 'automation', title: t('dashboard.automazioni', 'Automazioni'), desc: 'Notifiche, email, webhook, MQTT e apertura varchi', icon: 'zap', png: 'app_shield', route: 'automation', badge: { text: 'Regole', tone: 'amber' }, permission: 'alarm.manage' },
            { id: 'shield', title: t('dashboard.firewallARGUSSHIELD', 'Firewall ARGUS-SHIELD'), desc: 'Sorveglianza indirizzi IP e blocco attacchi', icon: 'shield', png: 'app_shield', route: 'settings', badge: { text: 'Shield', tone: 'amber' } },
            { id: 'mfa', title: t('dashboard.autenticazioneMFA', 'Autenticazione MFA'), desc: 'Protezione TOTP con codici di sicurezza', icon: 'lock', png: 'app_mfa', route: 'settings', badge: { text: 'TOTP', tone: 'red' } }
        ]
    },
    {
        id: 'system',
        title: t('dashboard.sistema', 'Sistema'),
        desc: 'Configurazione autonoma e telemetria',
        icon: 'server',
        png: 'area_sistema',
        color: 'cyan',
        getMetric: (info) => `v${info.version ?? '0.20.0'}`,
        subapps: [
            { id: 'cameras', title: t('dashboard.telecamere', 'Telecamere'), desc: 'Canali di rete e USB, parametri, orari e zone', icon: 'camera', png: 'app_cameras', route: 'cameras', badge: { text: 'Canali', tone: 'blue' }, permission: 'camera.manage' },
            { id: 'storage', title: t('dashboard.storageDischi', 'Storage & Dischi'), desc: 'Hard disk multipli, volumi RAID, quote e destinazioni NAS/SMB', icon: 'disk', png: 'app_settings', route: 'storage', badge: { text: 'Dischi', tone: 'amber' }, permission: 'system.manage' },
            { id: 'settings', title: t('dashboard.impostazioni', 'Impostazioni'), desc: 'Pannello schema-driven autogenerante', icon: 'settings', png: 'app_settings', route: 'settings', badge: { text: 'Config', tone: 'blue' }, permission: 'system.manage' },
            { id: 'system', title: t('dashboard.telemetria', 'Telemetria'), desc: 'Monitoraggio CPU, RAM, storage e rete', icon: 'activity', png: 'app_telemetry', route: 'system', badge: { text: 'Hardware', tone: 'purple' }, permission: 'system.manage' },
            { id: 'updates', title: t('dashboard.aggiornamentiVersioni', 'Aggiornamenti & Versioni'), desc: 'Controllo release, auto-upgrade OTA, installazione offline da USB e SMB', icon: 'download', png: 'app_settings', route: 'updates', badge: { text: 'OTA', tone: 'green' }, permission: 'system.manage' },
            { id: 'maintenance', title: t('dashboard.gestioneMacchina', 'Gestione Macchina'), desc: 'Riavvio servizi, spegnimento del server e pulizia delle cache', icon: 'power', png: 'app_settings', route: 'maintenance', badge: { text: 'Manutenzione', tone: 'amber' }, permission: 'system.manage' },
            { id: 'datetime', title: t('dashboard.dataOraSincronizzazione', 'Data, Ora & Sincronizzazione'), desc: 'Formato 24h o AM/PM, fuso orario, ora legale e NTP', icon: 'clock', png: 'app_settings', route: 'datetime', badge: { text: 'NTP', tone: 'blue' }, permission: 'system.manage' },
            { id: 'audio', title: t('dashboard.libreriaAudio', 'Libreria Audio'), desc: 'Messaggi preregistrati e diffusione sonora su telecamere', icon: 'speaker', png: 'app_settings', route: 'audio', badge: { text: 'Audio', tone: 'cyan' }, permission: 'system.manage' }
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
