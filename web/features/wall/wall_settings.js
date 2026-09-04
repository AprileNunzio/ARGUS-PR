import { el, chip, notice, pageHead } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, segmented, toggle, optionRow, metricTile } from '/assets/ui.js';
import { CLOCK_FORMAT_OPTIONS, DATE_STYLE_OPTIONS, formatWallTime, formatWallDate } from './wall_clock.js';
import { renderTileBoard, renderCameraRoster, renderOutputBoard, tileCount } from './wall_tiles.js';
import { classPicker, engineTable, overlayControls } from './wall_ai.js';
import { visionStatusBody } from './wall_vision_status.js';

const LAYOUT_OPTIONS = [
    { value: 'auto', label: 'Auto', icon: 'sparkles', hint: 'Adatta la griglia al numero di canali attivi' },
    { value: '1', label: '1', icon: 'monitor', hint: 'Singolo riquadro a pieno schermo' },
    { value: '4', label: '4', icon: 'grid', hint: 'Griglia 2x2' },
    { value: '9', label: '9', icon: 'grid', hint: 'Griglia 3x3' },
    { value: '16', label: '16', icon: 'apps', hint: 'Griglia 4x4' },
    { value: '25', label: '25', icon: 'apps', hint: 'Griglia 5x5' },
    { value: '36', label: '36', icon: 'apps', hint: 'Griglia 6x6' },
    { value: '64', label: '64', icon: 'apps', hint: 'Griglia 8x8, solo per monitor 4K' }
];

const QUALITY_OPTIONS = [
    { value: 'sub', label: 'Sub stream SD', icon: 'zap', hint: 'Basso bitrate: la scelta corretta per i muri con molti riquadri' },
    { value: 'main', label: 'Main stream HD', icon: 'sparkles', hint: 'Massima qualita: usa piu banda e piu CPU per ogni riquadro' }
];

function clonePayload(payload) {
    return JSON.parse(JSON.stringify(payload));
}

export async function renderWallSettings({ api }) {
    const root = el('div', { className: 'view wall-settings-view' });
    const feedback = el('div', {});

    let payload = await api.get('/api/wall/config').catch((error) => ({ failure: error }));
    let visionStatus = await api.get('/api/vision/status').catch(() => null);
    const engines = await api.get('/api/vision/engines')
        .then((data) => (data.capabilities ?? []).flatMap((capability) => (capability.engines ?? []).map((engine) => ({
            ...engine,
            capabilityLabel: capability.label
        }))))
        .catch(() => []);

    if (payload.failure) {
        root.replaceChildren(
            pageHead({ title: 'Regia & Configurazione Muro', hint: 'Layout, assegnazione riquadri, qualita dei flussi e uscite video' }),
            notice('error', `Impossibile caricare la configurazione del muro: ${payload.failure.message}`)
        );
        return root;
    }

    let draft = clonePayload(payload.config);
    let dirty = false;
    let clockTimer = null;

    const reload = async () => {
        const fresh = await api.get('/api/wall/config').catch(() => null);
        if (!fresh || fresh.revision === payload.revision) return;

        if (dirty) {
            feedback.replaceChildren(notice('warn', 'La configurazione del muro e stata modificata altrove. Salva per sovrascriverla oppure ricarica la pagina per vedere la versione aggiornata.'));
            return;
        }

        payload = fresh;
        draft = clonePayload(fresh.config);
        feedback.replaceChildren(notice('info', 'Configurazione aggiornata da un altro operatore.'));
        render();
    };

    const onRemoteEvent = (event) => {
        const topic = event.detail?.topic;
        if (topic === 'wall.config' || topic === 'time.config' || topic === 'camera.updated' || topic === 'camera.created' || topic === 'camera.deleted') {
            reload();
        }
    };

    window.addEventListener('argus:event', onRemoteEvent);

    const markDirty = () => {
        dirty = true;
        render();
    };

    const save = async () => {
        const result = await api.put('/api/wall/config', draft).catch((error) => ({ failure: error }));
        if (result.failure) {
            feedback.replaceChildren(notice('error', `Salvataggio non riuscito: ${result.failure.message}`));
            return;
        }
        payload = result;
        draft = clonePayload(result.config);
        dirty = false;
        feedback.replaceChildren(notice('ok', 'Regia salvata e applicata immediatamente al Muro Video su HDMI e su web.'));
        render();
    };

    const layoutCard = () => {
        const activeCameras = payload.cameras.filter((camera) => camera.enabled && !draft.excluded.includes(camera.id));
        const slots = tileCount(draft.layout, activeCameras.length);

        return card({
            title: 'Layout predefinito del muro',
            subtitle: 'Griglia applicata all avvio della console HDMI e a ogni riconnessione',
            iconName: 'grid',
            tone: 'blue',
            badge: chip(`${slots} riquadri`, 'info'),
            body: [
                segmented(LAYOUT_OPTIONS, draft.layout, (value) => {
                    draft.layout = value;
                    markDirty();
                }),
                el('div', { className: 'grid grid--stats' }, [
                    metricTile({ label: 'Riquadri disponibili', value: String(slots), iconName: 'grid', tone: 'blue' }),
                    metricTile({ label: 'Canali nel muro', value: String(activeCameras.length), iconName: 'camera', tone: 'emerald' }),
                    metricTile({ label: 'Canali esclusi', value: String(draft.excluded.length), iconName: 'close', tone: 'amber' }),
                    metricTile({
                        label: 'Uscite attive',
                        value: String(draft.outputs.filter((output) => output.enabled).length || payload.displays.filter((d) => d.connected).length),
                        iconName: 'monitor',
                        tone: 'purple'
                    })
                ]),
                optionRow({
                    title: 'Qualita predefinita dei flussi',
                    hint: 'Applicata a tutte le telecamere che non hanno una scelta esplicita nella tabella qui sotto',
                    iconName: 'activity',
                    control: segmented(QUALITY_OPTIONS, draft.defaultQuality, (value) => {
                        draft.defaultQuality = value;
                        markDirty();
                    }, { compact: true })
                }),
                optionRow({
                    title: 'Mostra riquadri anche per i canali offline',
                    hint: 'Mantiene la posizione dei riquadri quando una telecamera si disconnette',
                    iconName: 'eye',
                    control: toggle(draft.showOfflineTiles, (value) => {
                        draft.showOfflineTiles = value;
                        markDirty();
                    })
                })
            ]
        });
    };

    const tilesCard = () => card({
        title: 'Assegnazione riquadri',
        subtitle: 'Fissa una telecamera in una posizione precisa oppure lascia Automatico per il riempimento progressivo',
        iconName: 'crop',
        tone: 'purple',
        badge: chip(`${draft.tiles.length} fissati`, draft.tiles.length > 0 ? 'ok' : 'info'),
        actions: [
            el('button', {
                className: 'btn btn--sm',
                type: 'button',
                textContent: 'Azzera assegnazioni',
                onclick: () => {
                    draft.tiles = [];
                    markDirty();
                }
            })
        ],
        body: [
            renderTileBoard({
                layout: draft.layout,
                cameras: payload.cameras,
                config: draft,
                onAssign: (index, cameraId) => {
                    draft.tiles = draft.tiles.filter((tile) => tile.index !== index && tile.cameraId !== cameraId);
                    if (cameraId.length > 0) draft.tiles.push({ index, cameraId });
                    draft.tiles.sort((a, b) => a.index - b.index);
                    markDirty();
                }
            })
        ]
    });

    const rosterCard = () => card({
        title: 'Telecamere e qualita del flusso',
        subtitle: 'Escludi i canali che non devono comparire e scegli Main HD o Sub SD per ognuno',
        iconName: 'camera',
        tone: 'emerald',
        badge: chip(`${payload.cameras.length} canali`, 'info'),
        body: [
            renderCameraRoster({
                cameras: payload.cameras,
                config: draft,
                onExclude: (cameraId, excluded) => {
                    draft.excluded = draft.excluded.filter((entry) => entry !== cameraId);
                    if (excluded) {
                        draft.excluded.push(cameraId);
                        draft.tiles = draft.tiles.filter((tile) => tile.cameraId !== cameraId);
                    }
                    markDirty();
                },
                onQuality: (cameraId, quality) => {
                    draft.quality = { ...draft.quality, [cameraId]: quality };
                    markDirty();
                }
            })
        ]
    });

    const outputsCard = () => card({
        title: 'Uscite video hardware',
        subtitle: 'HDMI, DisplayPort e VGA rilevate dal kernel tramite DRM',
        iconName: 'monitor',
        tone: 'cyan',
        badge: chip(`${payload.displays.filter((display) => display.connected).length} collegate`, 'ok'),
        body: [
            renderOutputBoard({
                displays: payload.displays,
                config: draft,
                onToggle: (id, enabled) => {
                    draft.outputs = draft.outputs.filter((output) => output.id !== id);
                    draft.outputs.push({ id, enabled });
                    markDirty();
                },
                onPrimary: (id) => {
                    draft.primaryOutput = draft.primaryOutput === id ? null : id;
                    markDirty();
                }
            })
        ]
    });

    const aiCard = () => {
        const overlay = draft.overlay;
        const patchOverlay = (patch) => {
            draft.overlay = { ...draft.overlay, ...patch };
            dirty = true;
        };

        return card({
            title: 'Riconoscimento oggetti sul muro',
            subtitle: 'Disegna i contorni di persone, veicoli e animali direttamente sui riquadri, su HDMI e su web',
            iconName: 'eye',
            tone: 'purple',
            badge: chip(overlay.enabled ? `${overlay.classes.length} classi attive` : 'Disattivato', overlay.enabled ? 'ok' : 'info'),
            body: [
                optionRow({
                    title: 'Sovrapposizione dei riconoscimenti',
                    hint: 'I riquadri arrivano dal motore di visione gia attivo sulle telecamere: non viene aperto nessun flusso aggiuntivo',
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
                    ...overlayControls(overlay, (patch) => patchOverlay(patch))
                ]) : null,
                el('p', { className: 'xcard__note' }, [
                    icon('info'),
                    el('span', { textContent: 'Le classi compaiono soltanto se la telecamera ha la relativa analisi attiva in Telecamere, scheda Analisi. Qui scegli cosa disegnare, li scegli cosa far analizzare.' })
                ])
            ]
        });
    };

    const visionCard = () => {
        const refreshButton = el('button', { className: 'btn btn--sm', type: 'button' }, [
            icon('refresh'),
            el('span', { textContent: 'Aggiorna stato' })
        ]);

        refreshButton.addEventListener('click', async () => {
            refreshButton.disabled = true;
            visionStatus = await api.get('/api/vision/status').catch(() => visionStatus);
            refreshButton.disabled = false;
            render();
        });

        const active = visionStatus?.active ?? 0;

        return card({
            title: 'Stato del motore di visione',
            subtitle: 'Telemetria reale dei worker di inferenza: fotogrammi, latenza, rilevamenti e riavvii',
            iconName: 'activity',
            tone: active > 0 ? 'emerald' : 'amber',
            badge: chip(active > 0 ? `${active} canali in analisi` : 'Nessuna analisi attiva', active > 0 ? 'ok' : 'warn'),
            actions: [refreshButton],
            body: visionStatusBody(visionStatus)
        });
    };

    const enginesCard = () => card({
        title: 'Algoritmi di visione disponibili',
        subtitle: 'Modelli open source integrati, con costo di calcolo, ambiente di esecuzione e licenza',
        iconName: 'sparkles',
        tone: 'cyan',
        badge: chip(`${engines.filter((engine) => engine.status === 'ready').length} pronti`, 'ok'),
        body: [
            engineTable(engines),
            el('p', { className: 'xcard__note' }, [
                icon('info'),
                el('span', { textContent: 'La scelta del motore e per telecamera e si trova in Sistema › Telecamere › scheda Analisi, perche il costo di calcolo dipende dal singolo canale.' })
            ])
        ]
    });

    const clockCard = () => {
        const preview = el('span', { className: 'clock-preview__time' });
        const previewDate = el('span', { className: 'clock-preview__date' });

        const paint = () => {
            const now = new Date();
            preview.textContent = formatWallTime(now, draft.clock, payload.timezone);
            previewDate.textContent = formatWallDate(now, draft.clock, payload.timezone) || 'Data nascosta';
        };

        paint();
        if (clockTimer) clearInterval(clockTimer);
        clockTimer = setInterval(paint, 1000);

        return card({
            title: 'Orologio della statusbar',
            subtitle: 'Formato mostrato in basso a destra sul Muro Video',
            iconName: 'clock',
            tone: 'amber',
            badge: chip(payload.timezone ?? 'Fuso di sistema', 'info'),
            body: [
                el('div', { className: 'clock-preview' }, [
                    el('span', { className: 'clock-preview__icon' }, [icon('clock', { className: 'icon--xl' })]),
                    el('div', { className: 'clock-preview__body' }, [preview, previewDate])
                ]),
                optionRow({
                    title: 'Formato orario',
                    hint: 'Notazione europea a 24 ore oppure anglosassone con AM e PM',
                    iconName: 'clock',
                    control: segmented(CLOCK_FORMAT_OPTIONS.map((option) => ({ ...option, icon: 'clock' })), draft.clock.format, (value) => {
                        draft.clock = { ...draft.clock, format: value };
                        markDirty();
                    }, { compact: true })
                }),
                optionRow({
                    title: 'Data affiancata all orologio',
                    hint: 'Nessuna, breve (mar 04/09/2026) o estesa (martedi 4 settembre 2026)',
                    iconName: 'timeline',
                    control: segmented(DATE_STYLE_OPTIONS.map((option) => ({ ...option, icon: 'timeline' })), draft.clock.dateStyle, (value) => {
                        draft.clock = { ...draft.clock, dateStyle: value };
                        markDirty();
                    }, { compact: true })
                }),
                optionRow({
                    title: 'Mostra i secondi',
                    hint: 'Utile per la correlazione con i timestamp delle registrazioni',
                    iconName: 'activity',
                    control: toggle(draft.clock.showSeconds, (value) => {
                        draft.clock = { ...draft.clock, showSeconds: value };
                        markDirty();
                    }, ['Visibili', 'Nascosti'])
                }),
                optionRow({
                    title: 'Mostra la sigla del fuso orario',
                    hint: 'Aggiunge CET o CEST accanto all orario, per le postazioni multi-sede',
                    iconName: 'globe',
                    control: toggle(draft.clock.showTimezone, (value) => {
                        draft.clock = { ...draft.clock, showTimezone: value };
                        markDirty();
                    }, ['Visibile', 'Nascosta'])
                }),
                el('p', { className: 'xcard__note' }, [
                    icon('info'),
                    el('span', { textContent: 'Fuso orario, ora legale e sincronizzazione NTP si configurano in Sistema › Data, Ora & Sincronizzazione.' })
                ])
            ]
        });
    };

    const render = () => {
        const saveButton = el('button', {
            className: dirty ? 'btn btn--primary' : 'btn',
            type: 'button',
            disabled: dirty ? null : 'disabled',
            onclick: save
        }, [icon('check'), el('span', { textContent: dirty ? 'Salva regia' : 'Nessuna modifica' })]);

        root.replaceChildren(
            pageHead({
                title: 'Regia & Configurazione Muro',
                hint: 'Layout predefinito, assegnazione dei riquadri, qualita dei flussi, uscite video e orologio della statusbar',
                actions: [
                    el('button', {
                        className: 'btn',
                        type: 'button',
                        onclick: () => window.open('/wall', '_blank')
                    }, [icon('monitor'), el('span', { textContent: 'Apri Muro Video' })]),
                    saveButton
                ]
            }),
            feedback,
            el('div', { className: 'xstack' }, [
                layoutCard(),
                tilesCard(),
                rosterCard(),
                aiCard(),
                visionCard(),
                enginesCard(),
                outputsCard(),
                clockCard()
            ])
        );
    };

    root.addEventListener('argus:teardown', () => {
        if (clockTimer) clearInterval(clockTimer);
        window.removeEventListener('argus:event', onRemoteEvent);
    });

    render();
    return root;
}
