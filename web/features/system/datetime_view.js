import { el, chip, notice, pageHead } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, segmented, toggle, optionRow, metricTile } from '/assets/ui.js';
import { CLOCK_FORMAT_OPTIONS, DATE_STYLE_OPTIONS, formatWallTime, formatWallDate } from '/features/wall/wall_clock.js';

const COMMON_ZONES = [
    'Europe/Rome', 'Europe/London', 'Europe/Paris', 'Europe/Madrid', 'Europe/Berlin',
    'Europe/Zurich', 'Europe/Lisbon', 'Europe/Athens', 'Europe/Moscow', 'UTC',
    'America/New_York', 'America/Sao_Paulo', 'Asia/Dubai', 'Asia/Shanghai', 'Australia/Sydney'
];

function offsetLabel(minutes) {
    const sign = minutes < 0 ? '-' : '+';
    const absolute = Math.abs(minutes);
    return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

export async function renderDateTime({ api }) {
    const root = el('div', { className: 'view datetime-view' });
    const feedback = el('div', {});

    let data = await api.get('/api/system/time').catch((error) => ({ failure: error }));
    let draft = data.failure ? null : { ...data.config };
    let dirty = false;
    let timer = null;

    const say = (kind, text) => feedback.replaceChildren(notice(kind, text));

    const reload = async () => {
        data = await api.get('/api/system/time').catch((error) => ({ failure: error }));
        if (!data.failure) draft = { ...data.config };
        dirty = false;
        render();
    };

    const markDirty = () => {
        dirty = true;
        render();
    };

    const save = async () => {
        const result = await api.put('/api/system/time', draft).catch((error) => ({ failure: error }));

        if (result.failure) {
            say('error', `Salvataggio non riuscito: ${result.failure.message}`);
            return;
        }

        data = result;
        draft = { ...result.config };
        dirty = false;

        say(result.system?.applied
            ? 'ok'
            : 'warn', result.system?.applied
            ? `Configurazione salvata e fuso orario applicato al sistema operativo (${result.effectiveTimezone}).`
            : 'Configurazione salvata. Il fuso orario del sistema operativo non e stato modificato: serve il permesso di timedatectl.');

        render();
    };

    const clockCard = () => {
        const time = el('span', { className: 'clock-preview__time' });
        const date = el('span', { className: 'clock-preview__date' });

        const paint = () => {
            const now = new Date();
            time.textContent = formatWallTime(now, draft, data.effectiveTimezone);
            date.textContent = formatWallDate(now, draft, data.effectiveTimezone) || 'Data nascosta';
        };

        paint();
        if (timer) clearInterval(timer);
        timer = setInterval(paint, 1000);

        return card({
            title: 'Formato di data e ora',
            subtitle: 'Notazione usata nell interfaccia, nei referti e nelle esportazioni',
            iconName: 'clock',
            tone: 'blue',
            badge: chip(data.effectiveTimezone, 'info'),
            body: [
                el('div', { className: 'clock-preview' }, [
                    el('span', { className: 'clock-preview__icon' }, [icon('clock', { className: 'icon--xl' })]),
                    el('div', { className: 'clock-preview__body' }, [time, date])
                ]),
                optionRow({
                    title: 'Formato orario',
                    hint: '24 ore in notazione europea oppure 12 ore con indicatore AM e PM',
                    iconName: 'clock',
                    control: segmented(CLOCK_FORMAT_OPTIONS.map((option) => ({ ...option, icon: 'clock' })), draft.format, (value) => {
                        draft.format = value;
                        markDirty();
                    }, { compact: true })
                }),
                optionRow({
                    title: 'Stile della data',
                    hint: 'Determina come compare la data accanto all orario',
                    iconName: 'timeline',
                    control: segmented(DATE_STYLE_OPTIONS.map((option) => ({ ...option, icon: 'timeline' })), draft.dateStyle, (value) => {
                        draft.dateStyle = value;
                        markDirty();
                    }, { compact: true })
                }),
                optionRow({
                    title: 'Mostra i secondi',
                    hint: 'Necessario per correlare gli eventi con i timestamp dei segmenti registrati',
                    iconName: 'activity',
                    control: toggle(draft.showSeconds, (value) => {
                        draft.showSeconds = value;
                        markDirty();
                    }, ['Visibili', 'Nascosti'])
                })
            ]
        });
    };

    const timezoneCard = () => {
        const zones = [...new Set([data.systemTimezone, ...COMMON_ZONES, ...data.timezones])];

        const select = el('select', { className: 'select' });
        select.append(el('option', { value: 'system', textContent: `Fuso del sistema operativo (${data.systemTimezone})` }));
        for (const zone of zones) {
            const option = el('option', { value: zone, textContent: zone });
            if (zone === draft.timezone) option.selected = true;
            select.append(option);
        }
        if (draft.timezone === 'system') select.value = 'system';

        select.addEventListener('change', () => {
            draft.timezone = select.value;
            markDirty();
        });

        const dst = data.dst;

        return card({
            title: 'Fuso orario e ora legale',
            subtitle: 'Il fuso IANA determina automaticamente il passaggio fra ora solare e ora legale',
            iconName: 'globe',
            tone: 'purple',
            badge: chip(dst.active ? 'Ora legale attiva' : 'Ora solare', dst.active ? 'warn' : 'ok'),
            body: [
                el('div', { className: 'grid grid--stats' }, [
                    metricTile({ label: 'Scostamento attuale', value: offsetLabel(dst.currentOffsetMinutes), iconName: 'globe', tone: 'purple' }),
                    metricTile({ label: 'Ora solare di riferimento', value: offsetLabel(dst.standardOffsetMinutes), iconName: 'moon', tone: 'blue' }),
                    metricTile({ label: 'Spostamento DST', value: `${dst.shiftMinutes >= 0 ? '+' : ''}${dst.shiftMinutes} min`, iconName: 'sun', tone: dst.active ? 'amber' : 'emerald' }),
                    metricTile({ label: 'Ora legale osservata', value: dst.observed ? 'Si' : 'No', hint: dst.observed ? 'Questo fuso cambia ora due volte l anno' : 'Questo fuso mantiene sempre lo stesso scostamento', iconName: 'clock', tone: 'cyan' })
                ]),
                optionRow({
                    title: 'Fuso orario del sito',
                    hint: 'Su Linux la scelta viene applicata anche al sistema operativo tramite timedatectl',
                    iconName: 'globe',
                    control: select
                }),
                optionRow({
                    title: 'Gestione dell ora legale',
                    hint: 'Automatica segue le regole ufficiali del fuso IANA. Disattivata mantiene sempre l ora solare, utile per registrazioni a scostamento fisso.',
                    iconName: 'sun',
                    control: segmented([
                        { value: 'auto', label: 'Automatica', icon: 'sparkles', hint: 'Cambio ora legale e solare secondo il database IANA' },
                        { value: 'off', label: 'Sempre ora solare', icon: 'moon', hint: 'Nessun cambio stagionale' }
                    ], draft.dstMode, (value) => {
                        draft.dstMode = value;
                        markDirty();
                    }, { compact: true })
                }),
                dst.observed && draft.dstMode === 'off'
                    ? notice('warn', 'Il fuso selezionato osserva l ora legale ma il cambio stagionale e disattivato: gli orari mostrati differiranno di un ora dall ora civile per parte dell anno.')
                    : null
            ]
        });
    };

    const ntpCard = () => {
        const sync = data.sync;
        const serversInput = el('input', {
            className: 'input input--mono',
            value: draft.ntpServers.join(', '),
            placeholder: 'pool.ntp.org, time.google.com'
        });
        serversInput.addEventListener('input', () => {
            draft.ntpServers = serversInput.value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
            dirty = true;
        });

        const presets = el('div', { className: 'row row--tight row--wrap' }, data.presets.map((server) => el('button', {
            type: 'button',
            className: draft.ntpServers.includes(server) ? 'btn btn--sm btn--primary' : 'btn btn--sm',
            textContent: server,
            onclick: () => {
                draft.ntpServers = draft.ntpServers.includes(server)
                    ? draft.ntpServers.filter((entry) => entry !== server)
                    : [...draft.ntpServers, server];
                markDirty();
            }
        })));

        const syncButton = el('button', { className: 'btn btn--primary', type: 'button' }, [
            icon('refresh'),
            el('span', { textContent: 'Sincronizza adesso' })
        ]);

        syncButton.addEventListener('click', async () => {
            syncButton.disabled = true;
            const result = await api.post('/api/system/time/sync').catch((error) => ({ failure: error }));
            syncButton.disabled = false;

            if (result.failure) {
                say('error', `Sincronizzazione non riuscita: ${result.failure.message}`);
                return;
            }

            data = result.overview;
            say(result.success ? 'ok' : 'warn', result.success
                ? 'Richiesta di sincronizzazione accettata dal demone di tempo del sistema.'
                : `Il sistema ha rifiutato la sincronizzazione: ${result.error ?? 'permessi insufficienti'}.`);
            render();
        });

        const tone = sync.synchronized ? 'ok' : (sync.available ? 'warn' : 'bad');

        return card({
            title: 'Sincronizzazione NTP',
            subtitle: 'Un orologio disallineato invalida i timestamp delle prove video: la sincronizzazione e parte della catena di custodia',
            iconName: 'network',
            tone: sync.synchronized ? 'emerald' : 'amber',
            badge: chip(sync.synchronized ? 'Sincronizzato' : (sync.available ? 'Non sincronizzato' : 'Non disponibile'), tone),
            actions: [syncButton],
            body: [
                el('div', { className: 'spec-grid' }, [
                    el('div', { className: 'spec' }, [
                        el('span', { className: 'spec__k', textContent: 'Demone di tempo' }),
                        el('span', { className: 'spec__v', textContent: sync.service })
                    ]),
                    el('div', { className: 'spec' }, [
                        el('span', { className: 'spec__k', textContent: 'NTP abilitato' }),
                        el('span', { className: 'spec__v', textContent: sync.enabled ? 'si' : 'no' })
                    ]),
                    el('div', { className: 'spec' }, [
                        el('span', { className: 'spec__k', textContent: 'Fuso del sistema operativo' }),
                        el('span', { className: 'spec__v', textContent: sync.systemTimezone ?? data.systemTimezone })
                    ]),
                    el('div', { className: 'spec' }, [
                        el('span', { className: 'spec__k', textContent: 'Ora del server' }),
                        el('span', { className: 'spec__v', textContent: new Date(data.nowIso).toLocaleString('it-IT') })
                    ])
                ]),
                optionRow({
                    title: 'Sincronizzazione automatica',
                    hint: 'Mantiene l orologio allineato interrogando periodicamente i server NTP configurati',
                    iconName: 'refresh',
                    control: toggle(draft.ntpEnabled, (value) => {
                        draft.ntpEnabled = value;
                        markDirty();
                    })
                }),
                el('div', { className: 'field' }, [
                    el('label', { textContent: 'Server NTP' }),
                    serversInput,
                    el('span', { className: 'xrow__hint', textContent: 'Elenco separato da virgole, in ordine di priorita. Massimo sei server.' })
                ]),
                el('div', { className: 'stack stack--tight' }, [
                    el('span', { className: 'xrow__hint', textContent: 'Server suggeriti: un clic li aggiunge o li rimuove dall elenco.' }),
                    presets
                ]),
                sync.detail ? el('p', { className: 'xcard__note' }, [icon('info'), el('span', { textContent: sync.detail })]) : null
            ]
        });
    };

    const render = () => {
        if (data.failure) {
            root.replaceChildren(
                pageHead({ title: 'Data, Ora & Sincronizzazione', hint: 'Formato orario, fuso, ora legale e allineamento NTP' }),
                notice('error', `Impossibile leggere la configurazione temporale: ${data.failure.message}`)
            );
            return;
        }

        root.replaceChildren(
            pageHead({
                title: 'Data, Ora & Sincronizzazione',
                hint: 'Formato 24h o AM/PM, fuso orario, ora legale automatica e sincronizzazione NTP con i server ufficiali',
                actions: [
                    el('button', { className: 'btn', type: 'button', onclick: reload }, [icon('refresh'), el('span', { textContent: 'Ricarica' })]),
                    el('button', {
                        className: dirty ? 'btn btn--primary' : 'btn',
                        type: 'button',
                        disabled: dirty ? null : 'disabled',
                        onclick: save
                    }, [icon('check'), el('span', { textContent: dirty ? 'Salva configurazione' : 'Nessuna modifica' })])
                ]
            }),
            feedback,
            el('div', { className: 'xstack' }, [
                clockCard(),
                timezoneCard(),
                ntpCard()
            ])
        );
    };

    root.addEventListener('argus:teardown', () => {
        if (timer) clearInterval(timer);
    });

    render();
    return root;
}
