import { el, chip } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { segmented, toggle } from '/assets/ui.js';

export function renderCameraRoster({ cameras, config, onExclude, onQuality }) {
    if (cameras.length === 0) {
        return el('div', { className: 'empty' }, [
            icon('camera', { className: 'icon--xl' }),
            el('p', { textContent: 'Nessuna telecamera registrata. Aggiungine una da Sistema › Telecamere.' })
        ]);
    }

    return el('div', { className: 'roster' }, cameras.map((camera) => {
        const excluded = config.excluded.includes(camera.id);
        const quality = config.quality[camera.id] ?? config.defaultQuality;
        const warning = quality === 'sub' && !camera.hasSubStream && camera.sourceKind !== 'usb';

        const qualityControl = segmented([
            { value: 'sub', label: 'Sub SD', icon: 'zap', hint: 'Flusso secondario a basso bitrate, consigliato per il muro' },
            { value: 'main', label: 'Main HD', icon: 'sparkles', hint: 'Flusso principale ad alta risoluzione, richiede piu banda e CPU' }
        ], quality, (value) => onQuality(camera.id, value), { compact: true });

        return el('div', { className: excluded ? 'roster__row roster__row--off' : 'roster__row' }, [
            el('div', { className: 'roster__lead' }, [
                el('span', { className: 'roster__avatar' }, [icon('camera')]),
                el('div', { className: 'roster__text' }, [
                    el('span', { className: 'roster__name', textContent: camera.name }),
                    el('span', { className: 'roster__meta' }, [
                        chip(camera.enabled ? 'Attiva' : 'Disattivata', camera.enabled ? 'ok' : 'bad'),
                        chip(String(camera.sourceKind ?? 'rtsp').toUpperCase(), 'info'),
                        camera.hasSubStream ? chip('Sub disponibile', 'ok') : chip('Nessun sub-stream', 'warn')
                    ])
                ])
            ]),
            el('div', { className: 'roster__controls' }, [
                qualityControl,
                toggle(!excluded, (value) => onExclude(camera.id, !value), ['Nel muro', 'Esclusa'])
            ]),
            warning ? el('p', { className: 'roster__warning' }, [
                icon('warning'),
                el('span', { textContent: 'Questa telecamera non espone un sub-stream: il muro usera il flusso principale, con piu carico su CPU e rete.' })
            ]) : null
        ]);
    }));
}
