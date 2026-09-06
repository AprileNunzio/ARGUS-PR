import { el, chip, formatBytes } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { metricTile, optionRow } from '/assets/ui.js';

const SEVERITY_TONES = { warning: 'warn', opportunity: 'info', info: 'ok' };
const SEVERITY_LABELS = { warning: 'Da sistemare', opportunity: 'Miglioria disponibile', info: 'Nota' };

function commandBlock(command) {
    if (!command) return null;

    const code = el('code', { className: 'cap-command__text', textContent: command });
    const button = el('button', {
        type: 'button',
        className: 'btn btn--sm',
        title: 'Copia negli appunti'
    }, [icon('crop'), el('span', { textContent: 'Copia' })]);

    button.addEventListener('click', async () => {
        const copied = await navigator.clipboard?.writeText(command).then(() => true).catch(() => false);
        button.replaceChildren(icon(copied ? 'check' : 'close'), el('span', { textContent: copied ? 'Copiato' : 'Non riuscito' }));
        setTimeout(() => button.replaceChildren(icon('crop'), el('span', { textContent: 'Copia' })), 1800);
    });

    return el('div', { className: 'cap-command' }, [code, button]);
}

function suggestionRow(entry) {
    return el('div', { className: `cap-suggestion cap-suggestion--${entry.severity}` }, [
        el('div', { className: 'cap-suggestion__head' }, [
            icon(entry.severity === 'warning' ? 'warning' : 'info'),
            el('strong', { textContent: entry.title }),
            chip(SEVERITY_LABELS[entry.severity] ?? entry.severity, SEVERITY_TONES[entry.severity] ?? 'info')
        ]),
        el('p', { className: 'cap-suggestion__detail', textContent: entry.detail }),
        commandBlock(entry.command)
    ].filter(Boolean));
}

function listOrDash(values, tone = 'info') {
    if (!Array.isArray(values) || values.length === 0) {
        return el('span', { className: 'xrow__hint', textContent: 'nessuno' });
    }
    return el('div', { className: 'row row--tight row--wrap' }, values.map((value) => chip(value, tone)));
}

export function capabilitiesBody(report) {
    if (!report) {
        return [el('span', { className: 'xrow__hint', textContent: 'Rilevamento delle capacita non disponibile.' })];
    }

    const devices = report.video.devices ?? [];
    const modules = report.video.codecModules ?? [];
    const thermal = report.thermal ?? { available: false };

    return [
        el('div', { className: 'grid grid--stats' }, [
            metricTile({
                label: 'Core logici',
                value: String(report.cpu.logicalCores),
                hint: report.cpu.model,
                iconName: 'cpu',
                tone: 'blue'
            }),
            metricTile({
                label: 'Memoria totale',
                value: formatBytes(report.memory.totalBytes),
                hint: `${report.memory.usedPercent}% in uso`,
                iconName: 'memory',
                tone: report.memory.usedPercent > 85 ? 'red' : 'emerald'
            }),
            metricTile({
                label: 'Analisi consigliata',
                value: `${report.analysis.suggestedFps} fps`,
                hint: 'Per singolo canale con riconoscimento oggetti',
                iconName: 'eye',
                tone: 'purple'
            }),
            metricTile({
                label: 'Temperatura',
                value: thermal.available ? `${thermal.hottest.celsius} °C` : 'n/d',
                hint: thermal.available ? thermal.hottest.type ?? thermal.hottest.zone : 'Sensore non esposto dal sistema',
                iconName: 'activity',
                tone: thermal.available && thermal.hottest.celsius > 75 ? 'red' : 'cyan'
            })
        ]),

        el('div', { className: 'spec-grid' }, [
            el('div', { className: 'spec' }, [
                el('span', { className: 'spec__k', textContent: 'Piattaforma' }),
                el('span', { className: 'spec__v', textContent: `${report.platform.type} ${report.platform.release} ${report.platform.arch}` })
            ]),
            report.platform.model ? el('div', { className: 'spec' }, [
                el('span', { className: 'spec__k', textContent: 'Macchina' }),
                el('span', { className: 'spec__v', textContent: report.platform.model })
            ]) : null,
            el('div', { className: 'spec' }, [
                el('span', { className: 'spec__k', textContent: 'ffmpeg' }),
                el('span', { className: 'spec__v', textContent: report.video.ffmpeg.available ? report.video.ffmpeg.version : 'non disponibile' })
            ]),
            el('div', { className: 'spec' }, [
                el('span', { className: 'spec__k', textContent: 'Runtime AI' }),
                el('span', { className: 'spec__v', textContent: report.ai.available ? 'operativo' : (report.ai.reason ?? 'non disponibile') })
            ])
        ].filter(Boolean)),

        optionRow({
            title: 'Acceleratori di decodifica verificati',
            hint: 'Dichiarati dal binario ffmpeg contro quelli che il dispositivo accetta davvero, provati uno per uno all avvio',
            iconName: 'zap',
            control: el('div', { className: 'stack stack--tight' }, [
                el('div', { className: 'row row--tight' }, [
                    el('span', { className: 'xrow__hint', textContent: 'compilati:' }),
                    listOrDash(report.video.accelerators.compiled, 'info')
                ]),
                el('div', { className: 'row row--tight' }, [
                    el('span', { className: 'xrow__hint', textContent: 'usabili:' }),
                    listOrDash(report.video.accelerators.usable, 'ok')
                ])
            ])
        }),

        optionRow({
            title: 'Encoder disponibili',
            hint: 'Verificati con una codifica di prova. Servono solo quando il flusso non puo essere copiato senza conversione',
            iconName: 'activity',
            control: listOrDash(report.video.encoders.usable, 'ok')
        }),

        optionRow({
            title: 'Provider di inferenza',
            hint: 'Motori ONNX Runtime installati sulla macchina',
            iconName: 'sparkles',
            control: listOrDash(report.ai.providers ?? [], report.ai.available ? 'ok' : 'warn')
        }),

        devices.length > 0 ? optionRow({
            title: 'Dispositivi video del kernel',
            hint: 'Interfacce V4L2 esposte dal sistema operativo',
            iconName: 'monitor',
            control: el('div', { className: 'row row--tight row--wrap' }, devices.map((device) => (
                chip(`${device.path}${device.driver ? ` · ${device.driver}` : ''}`, device.accessible ? 'ok' : 'warn')
            )))
        }) : null,

        modules.length > 0 ? optionRow({
            title: 'Moduli codec del kernel',
            hint: 'Acceleratori del chip riconosciuti su questa piattaforma',
            iconName: 'disk',
            control: el('div', { className: 'row row--tight row--wrap' }, modules.map((entry) => (
                chip(`${entry.module}${entry.loaded ? ' · caricato' : ' · non caricato'}`, entry.loaded ? 'ok' : 'warn')
            )))
        }) : null,

        report.suggestions.length > 0
            ? el('div', { className: 'stack stack--tight' }, [
                el('span', { className: 'xrow__title', textContent: 'Cosa puoi abilitare su questa macchina' }),
                el('span', { className: 'xrow__hint', textContent: 'ARGUS-PR non applica nulla da solo: qui trovi cosa e disponibile e il comando esatto, la scelta resta tua.' }),
                ...report.suggestions.map(suggestionRow)
            ])
            : el('p', { className: 'xcard__note' }, [
                icon('check'),
                el('span', { textContent: 'Nessuna miglioria rilevata: la macchina sta gia usando tutto cio che espone.' })
            ])
    ].filter(Boolean);
}
