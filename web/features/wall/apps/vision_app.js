import { el, chip, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, toggle, optionRow } from '/assets/ui.js';
import { classPicker, engineTable, overlayControls } from '../wall_ai.js';
import { visionStatusBody } from '../wall_vision_status.js';

export async function renderVisionApp({ api, payload }) {
    const host = el('div', { className: 'xstack' });
    const feedback = el('div', {});

    let config = JSON.parse(JSON.stringify(payload.config));
    let dirty = false;

    let visionStatus = await api.get('/api/vision/status').catch(() => null);
    const engines = await api.get('/api/vision/engines')
        .then((data) => (data.capabilities ?? []).flatMap((capability) => (capability.engines ?? []).map((engine) => ({
            ...engine,
            capabilityLabel: capability.label
        }))))
        .catch(() => []);

    const save = async () => {
        const result = await api.put('/api/wall/config', config).catch((error) => ({ failure: error }));
        if (result.failure) {
            feedback.replaceChildren(notice('error', `Salvataggio non riuscito: ${result.failure.message}`));
            return;
        }
        config = JSON.parse(JSON.stringify(result.config));
        dirty = false;
        feedback.replaceChildren(notice('ok', 'Riconoscimento salvato e applicato immediatamente al muro.'));
        render();
    };

    const patchOverlay = (patch) => {
        config.overlay = { ...config.overlay, ...patch };
        dirty = true;
    };

    const overlayCard = () => {
        const overlay = config.overlay;

        return card({
            title: 'Contorni degli oggetti riconosciuti',
            subtitle: 'Disegna persone, veicoli e animali sui riquadri, su HDMI e su web',
            iconName: 'eye',
            tone: 'purple',
            badge: chip(overlay.enabled ? `${overlay.classes.length} classi attive` : 'Disattivato', overlay.enabled ? 'ok' : 'info'),
            body: [
                optionRow({
                    title: 'Sovrapposizione dei riconoscimenti',
                    hint: 'I riquadri arrivano dal motore gia attivo sulle telecamere: non viene aperto nessun flusso aggiuntivo',
                    iconName: 'sparkles',
                    control: toggle(overlay.enabled, (value) => {
                        patchOverlay({ enabled: value });
                        render();
                    })
                }),
                overlay.enabled ? el('div', { className: 'stack' }, [
                    el('span', { className: 'xrow__title', textContent: 'Oggetti da evidenziare' }),
                    classPicker(overlay, (className, active) => {
                        const set = new Set(overlay.classes);
                        if (active) set.add(className);
                        else set.delete(className);
                        patchOverlay({ classes: [...set] });
                        render();
                    }, (classes, active) => {
                        const set = new Set(overlay.classes);
                        for (const entry of classes) {
                            if (active) set.add(entry);
                            else set.delete(entry);
                        }
                        patchOverlay({ classes: [...set] });
                        render();
                    }),
                    ...overlayControls(overlay, patchOverlay)
                ]) : null,
                el('p', { className: 'xcard__note' }, [
                    icon('info'),
                    el('span', { textContent: 'Le classi compaiono solo se la telecamera ha la relativa analisi attiva in Sistema, Telecamere, scheda Analisi. Qui scegli cosa disegnare, li scegli cosa far analizzare.' })
                ])
            ]
        });
    };

    const statusCard = () => {
        const refresh = el('button', { className: 'btn btn--sm', type: 'button' }, [
            icon('refresh'),
            el('span', { textContent: 'Aggiorna stato' })
        ]);

        refresh.addEventListener('click', async () => {
            refresh.disabled = true;
            visionStatus = await api.get('/api/vision/status').catch(() => visionStatus);
            refresh.disabled = false;
            render();
        });

        const active = visionStatus?.active ?? 0;

        return card({
            title: 'Stato del motore di visione',
            subtitle: 'Telemetria reale dei worker: fotogrammi, latenza, rilevamenti, scarti e riavvii',
            iconName: 'activity',
            tone: active > 0 ? 'emerald' : 'amber',
            badge: chip(active > 0 ? `${active} canali in analisi` : 'Nessuna analisi attiva', active > 0 ? 'ok' : 'warn'),
            actions: [refresh],
            body: visionStatusBody(visionStatus)
        });
    };

    const render = () => {
        host.replaceChildren(
            feedback,
            el('div', { className: 'row row--end' }, [
                el('button', {
                    className: dirty ? 'btn btn--primary' : 'btn',
                    type: 'button',
                    disabled: dirty ? null : 'disabled',
                    onclick: save
                }, [icon('check'), el('span', { textContent: dirty ? 'Salva riconoscimento' : 'Nessuna modifica' })])
            ]),
            overlayCard(),
            statusCard(),
            card({
                title: 'Algoritmi disponibili',
                subtitle: 'Modelli open source integrati, con costo di calcolo, ambiente di esecuzione e licenza',
                iconName: 'sparkles',
                tone: 'cyan',
                badge: chip(`${engines.filter((engine) => engine.status === 'ready').length} pronti`, 'ok'),
                body: [
                    engineTable(engines),
                    el('p', { className: 'xcard__note' }, [
                        icon('info'),
                        el('span', { textContent: 'La scelta del motore e per telecamera e si trova in Sistema, Telecamere, scheda Analisi, perche il costo di calcolo dipende dal singolo canale.' })
                    ])
                ]
            })
        );
    };

    render();
    return host;
}
