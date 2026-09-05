import { el, chip, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, segmented, toggle, optionRow } from '/assets/ui.js';
import { CLOCK_FORMAT_OPTIONS, DATE_STYLE_OPTIONS, formatWallTime, formatWallDate } from '../wall_clock.js';

const STATUSBAR_PARTS = [
    { id: 'brand', label: 'Marchio ARGUS-PR', hint: 'Logo e nome del software a sinistra', icon: 'shield' },
    { id: 'endpoint', label: 'Indirizzo IP del server', hint: 'Utile in installazione, superfluo su un muro in esercizio', icon: 'globe' },
    { id: 'sync', label: 'Stato sincronizzazione', hint: 'Pallino che segnala se la configurazione arriva in tempo reale', icon: 'activity' },
    { id: 'layout', label: 'Pulsanti della griglia', hint: 'Selettore rapido del numero di riquadri', icon: 'grid' },
    { id: 'channels', label: 'Numero di canali', hint: 'Quante telecamere sono attive', icon: 'camera' },
    { id: 'recording', label: 'Canali in registrazione', hint: 'Quante telecamere stanno registrando', icon: 'record' },
    { id: 'outputs', label: 'Uscita video', hint: 'Monitor collegati alle uscite hardware', icon: 'monitor' },
    { id: 'cpu', label: 'Carico CPU', hint: 'Percentuale di occupazione del processore', icon: 'cpu' },
    { id: 'ram', label: 'Memoria occupata', hint: 'Percentuale di RAM in uso', icon: 'memory' },
    { id: 'gpu', label: 'Acceleratore grafico', hint: 'Etichetta della GPU rilevata', icon: 'zap' },
    { id: 'version', label: 'Versione installata', hint: 'Numero di versione di ARGUS-PR', icon: 'download' },
    { id: 'clock', label: 'Orologio', hint: 'Data e ora nell angolo destro', icon: 'clock' }
];

const TILE_PARTS = [
    { id: 'name', label: 'Nome della telecamera', hint: 'Etichetta in alto a sinistra su ogni riquadro', icon: 'camera' },
    { id: 'state', label: 'Pallino di stato', hint: 'Verde in diretta, giallo in connessione, rosso non disponibile', icon: 'activity' },
    { id: 'quality', label: 'Indicatore HD o SD', hint: 'Segnala quale flusso riceve il riquadro', icon: 'sparkles' },
    { id: 'tools', label: 'Comandi al passaggio del mouse', hint: 'Playback, foto, registrazione, automazioni e altro', icon: 'settings' },
    { id: 'placeholder', label: 'Marchio sui riquadri liberi', hint: 'Logo e firma negli spazi senza telecamera', icon: 'shield' }
];

export async function renderAppearanceApp({ api, payload }) {
    const host = el('div', { className: 'xstack' });
    const feedback = el('div', {});

    let config = JSON.parse(JSON.stringify(payload.config));
    let dirty = false;
    let timer = null;

    const save = async () => {
        const result = await api.put('/api/wall/config', config).catch((error) => ({ failure: error }));
        if (result.failure) {
            feedback.replaceChildren(notice('error', `Salvataggio non riuscito: ${result.failure.message}`));
            return;
        }
        config = JSON.parse(JSON.stringify(result.config));
        dirty = false;
        feedback.replaceChildren(notice('ok', 'Aspetto salvato e applicato immediatamente al muro.'));
        render();
    };

    const touch = () => {
        dirty = true;
        render();
    };

    const partRows = (definitions, bucket) => definitions.map((entry) => optionRow({
        title: entry.label,
        hint: entry.hint,
        iconName: entry.icon,
        control: toggle(bucket[entry.id] !== false, (value) => {
            bucket[entry.id] = value;
            dirty = true;
        }, ['Visibile', 'Nascosto'])
    }));

    const clockCard = () => {
        const time = el('span', { className: 'clock-preview__time' });
        const date = el('span', { className: 'clock-preview__date' });

        const paint = () => {
            const now = new Date();
            time.textContent = formatWallTime(now, config.clock, payload.timezone);
            date.textContent = formatWallDate(now, config.clock, payload.timezone) || 'Data nascosta';
        };

        paint();
        if (timer) clearInterval(timer);
        timer = setInterval(paint, 1000);

        return card({
            title: 'Orologio della barra di stato',
            subtitle: 'Formato mostrato in basso a destra sul muro',
            iconName: 'clock',
            tone: 'amber',
            badge: chip(payload.timezone ?? 'Fuso di sistema', 'info'),
            body: [
                el('div', { className: 'clock-preview' }, [
                    el('span', { className: 'clock-preview__icon' }, [icon('clock', { className: 'icon--xl' })]),
                    el('div', { className: 'clock-preview__body' }, [time, date])
                ]),
                optionRow({
                    title: 'Formato orario',
                    hint: '24 ore in notazione europea oppure 12 ore con AM e PM',
                    iconName: 'clock',
                    control: segmented(CLOCK_FORMAT_OPTIONS.map((option) => ({ ...option, icon: 'clock' })), config.clock.format, (value) => {
                        config.clock = { ...config.clock, format: value };
                        touch();
                    }, { compact: true })
                }),
                optionRow({
                    title: 'Stile della data',
                    hint: 'Nessuna, breve o estesa accanto all orario',
                    iconName: 'timeline',
                    control: segmented(DATE_STYLE_OPTIONS.map((option) => ({ ...option, icon: 'timeline' })), config.clock.dateStyle, (value) => {
                        config.clock = { ...config.clock, dateStyle: value };
                        touch();
                    }, { compact: true })
                }),
                optionRow({
                    title: 'Secondi',
                    hint: 'Necessari per correlare gli eventi con i timestamp dei segmenti',
                    iconName: 'activity',
                    control: toggle(config.clock.showSeconds, (value) => {
                        config.clock = { ...config.clock, showSeconds: value };
                        touch();
                    }, ['Visibili', 'Nascosti'])
                }),
                optionRow({
                    title: 'Sigla del fuso orario',
                    hint: 'Aggiunge CET o CEST accanto all orario',
                    iconName: 'globe',
                    control: toggle(config.clock.showTimezone, (value) => {
                        config.clock = { ...config.clock, showTimezone: value };
                        touch();
                    }, ['Visibile', 'Nascosta'])
                })
            ]
        });
    };

    const render = () => {
        const visibleParts = STATUSBAR_PARTS.filter((entry) => config.statusbar[entry.id] !== false).length;

        host.replaceChildren(
            feedback,
            el('div', { className: 'row row--end' }, [
                el('button', {
                    className: dirty ? 'btn btn--primary' : 'btn',
                    type: 'button',
                    disabled: dirty ? null : 'disabled',
                    onclick: save
                }, [icon('check'), el('span', { textContent: dirty ? 'Salva aspetto' : 'Nessuna modifica' })])
            ]),
            card({
                title: 'Barra di stato',
                subtitle: 'Accendi o spegni ogni singola informazione mostrata in fondo al muro',
                iconName: 'sliders',
                tone: 'cyan',
                badge: chip(`${visibleParts}/${STATUSBAR_PARTS.length} visibili`, visibleParts > 0 ? 'ok' : 'warn'),
                body: [
                    optionRow({
                        title: 'Mostra la barra di stato',
                        hint: 'Spegnendola il muro diventa video a pieno schermo, senza alcuna sovrimpressione in basso',
                        iconName: 'monitor',
                        control: toggle(config.statusbar.visible !== false, (value) => {
                            config.statusbar.visible = value;
                            touch();
                        })
                    }),
                    ...(config.statusbar.visible === false ? [] : partRows(STATUSBAR_PARTS, config.statusbar))
                ]
            }),
            card({
                title: 'Elementi sui riquadri',
                subtitle: 'Cosa compare sopra il video di ogni telecamera',
                iconName: 'crop',
                tone: 'purple',
                body: partRows(TILE_PARTS, config.tile)
            }),
            clockCard()
        );
    };

    host.addEventListener('argus:teardown', () => {
        if (timer) clearInterval(timer);
    });

    render();
    return host;
}
