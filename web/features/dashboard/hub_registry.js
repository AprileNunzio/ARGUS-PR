export const MACRO_AREAS = [
    {
        id: 'surveillance',
        title: 'Flussi Live',
        icon: 'camera',
        color: 'blue',
        getMetric: (info) => `${info.cameraCount ?? 0} canali`,
        subapps: [
            { id: 'live', title: 'Diretta', icon: 'play', route: 'live', badge: { text: 'fMP4', tone: 'green' } },
            { id: 'wall', title: 'Muro Video', icon: 'monitor', route: 'wall', isPage: true, badge: { text: 'Wall', tone: 'blue' } },
            { id: 'cameras', title: 'Telecamere', icon: 'camera', route: 'cameras', badge: { text: 'ONVIF', tone: 'blue' } }
        ]
    },
    {
        id: 'archive',
        title: 'Registrazioni',
        icon: 'archive',
        color: 'emerald',
        getMetric: () => 'H.264 · 24/7',
        subapps: [
            { id: 'archive_player', title: 'Filmati', icon: 'play', route: 'archive', badge: { text: 'Archivio', tone: 'green' } },
            { id: 'timeline', title: 'Timeline', icon: 'timeline', route: 'archive', badge: { text: 'Eventi', tone: 'purple' } }
        ]
    },
    {
        id: 'vision',
        title: 'Visione AI',
        icon: 'sparkles',
        color: 'purple',
        getMetric: () => 'ONNX Attivo',
        subapps: [
            { id: 'detections', title: 'Rilevamenti', icon: 'eye', route: 'detections', badge: { text: 'AI', tone: 'purple' } },
            { id: 'people', title: 'Volti', icon: 'users', route: 'people', badge: { text: 'Biometria', tone: 'blue' } },
            { id: 'access', title: 'Targhe', icon: 'shield', route: 'access', badge: { text: 'ANPR', tone: 'green' } }
        ]
    },
    {
        id: 'security',
        title: 'Sicurezza',
        icon: 'shield',
        color: 'amber',
        getMetric: () => 'Zero-Trust',
        subapps: [
            { id: 'shield', title: 'Firewall', icon: 'shield', route: 'settings', badge: { text: 'Shield', tone: 'amber' } },
            { id: 'mfa', title: 'MFA', icon: 'lock', route: 'settings', badge: { text: 'TOTP', tone: 'red' } }
        ]
    },
    {
        id: 'system',
        title: 'Sistema',
        icon: 'server',
        color: 'cyan',
        getMetric: (info) => `v${info.version ?? '0.15.0'}`,
        subapps: [
            { id: 'settings', title: 'Impostazioni', icon: 'settings', route: 'settings', badge: { text: 'Config', tone: 'blue' }, permission: 'system.manage' },
            { id: 'system', title: 'Telemetria', icon: 'activity', route: 'system', badge: { text: 'Hardware', tone: 'purple' }, permission: 'system.manage' }
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
