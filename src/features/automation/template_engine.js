export function formatTemplate(template, context = {}) {
    if (!template || typeof template !== 'string') return null;

    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
        const value = context[key];
        if (value === undefined || value === null || value === '') {
            return match;
        }
        return String(value);
    });
}

export function buildTemplateContext({ rule, event, cameraName, recentOccurrences, dwellSeconds }) {
    const when = new Date(event.timestamp ?? Date.now()).toLocaleString('it-IT');
    const plate = event.plateText || event.plate || null;
    const person = event.personName || (event.personId ? `Persona #${String(event.personId).slice(0, 8)}` : null);
    const upperColor = event.upperColor || null;
    const dwell = dwellSeconds ?? event.dwellSeconds ?? (event.durationMs ? Math.round(event.durationMs / 1000) : null);

    return {
        rule_name: rule?.name ?? '',
        camera: cameraName ?? event.cameraId ?? 'canale sconosciuto',
        camera_id: event.cameraId ?? '',
        time: when,
        class: event.className ?? event.kind ?? 'evento',
        plate: plate ?? '',
        person: person ?? '',
        upper_color: upperColor ?? '',
        occurrences: recentOccurrences ?? 1,
        dwell_seconds: dwell ?? 0,
        dwell_formatted: dwell ? `${dwell}s` : '0s',
        zone: event.zoneLabel ?? ''
    };
}
