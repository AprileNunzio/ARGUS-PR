import { el, chip, empty } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { metricTile } from '/assets/ui.js';
import { CLASS_LABELS } from './wall_overlay.js';

const STATE_TONES = {
    running: 'ok',
    starting: 'warn',
    restarting: 'warn',
    stopped: 'info',
    failed: 'bad',
    unknown: 'warn'
};

const STATE_LABELS = {
    running: 'In esecuzione',
    starting: 'Avvio',
    restarting: 'Riavvio',
    stopped: 'Fermo',
    failed: 'Errore',
    unknown: 'Sconosciuto'
};

const PROVIDER_LABELS = {
    CPUExecutionProvider: 'CPU',
    CUDAExecutionProvider: 'NVIDIA CUDA',
    OpenVINOExecutionProvider: 'Intel OpenVINO',
    DmlExecutionProvider: 'DirectML',
    CoreMLExecutionProvider: 'Apple CoreML',
    AzureExecutionProvider: 'Azure'
};

function relative(timestamp) {
    if (!timestamp) return 'mai';
    const seconds = Math.round((Date.now() - timestamp) / 1000);
    if (seconds < 2) return 'ora';
    if (seconds < 60) return `${seconds} s fa`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min fa`;
    return `${Math.round(seconds / 3600)} h fa`;
}

function cameraRow(entry) {
    const tone = entry.stale ? 'warn' : (STATE_TONES[entry.state] ?? 'info');
    const stateLabel = entry.stale ? 'Nessun fotogramma' : (STATE_LABELS[entry.state] ?? entry.state);

    return el('div', { className: 'vision-row' }, [
        el('div', { className: 'vision-row__head' }, [
            el('span', { className: 'vision-row__icon' }, [icon('eye')]),
            el('strong', { className: 'vision-row__name', textContent: entry.cameraName }),
            chip(stateLabel, tone),
            entry.provider ? chip(PROVIDER_LABELS[entry.provider] ?? entry.provider, 'info') : null
        ].filter(Boolean)),
        el('div', { className: 'spec-grid' }, [
            el('div', { className: 'spec' }, [
                el('span', { className: 'spec__k', textContent: 'Fotogrammi al secondo' }),
                el('span', { className: 'spec__v', textContent: `${entry.framesPerSecond ?? 0}` })
            ]),
            el('div', { className: 'spec' }, [
                el('span', { className: 'spec__k', textContent: 'Latenza di inferenza' }),
                el('span', { className: 'spec__v', textContent: entry.inferenceMs === null || entry.inferenceMs === undefined ? '--' : `${entry.inferenceMs} ms` })
            ]),
            el('div', { className: 'spec' }, [
                el('span', { className: 'spec__k', textContent: 'Ultimo rilevamento' }),
                el('span', { className: 'spec__v', textContent: relative(entry.lastDetectionAt) })
            ]),
            el('div', { className: 'spec' }, [
                el('span', { className: 'spec__k', textContent: 'Rilevamenti totali' }),
                el('span', { className: 'spec__v', textContent: String(entry.detections ?? 0) })
            ]),
            el('div', { className: 'spec' }, [
                el('span', { className: 'spec__k', textContent: 'Fotogrammi scartati' }),
                el('span', { className: 'spec__v', textContent: String(entry.droppedFrames ?? 0) })
            ]),
            el('div', { className: 'spec' }, [
                el('span', { className: 'spec__k', textContent: 'Riavvii del worker' }),
                el('span', { className: 'spec__v', textContent: String(entry.restarts ?? 0) })
            ]),
            el('div', { className: 'spec' }, [
                el('span', { className: 'spec__k', textContent: 'Attivo da' }),
                el('span', { className: 'spec__v', textContent: `${entry.uptimeSeconds ?? 0} s` })
            ])
        ]),
        el('div', { className: 'row row--tight row--wrap' }, [
            el('span', { className: 'xrow__hint', textContent: 'Classi analizzate:' }),
            ...(entry.classes ?? []).map((className) => chip(CLASS_LABELS[className] ?? className, 'info'))
        ]),
        entry.saturated
            ? el('p', { className: 'xcard__note' }, [
                icon('warning'),
                el('span', { textContent: `L inferenza impiega ${entry.inferenceMs} ms ma il canale analizza ${entry.analysisFps} fotogrammi al secondo: il motore scarta i fotogrammi arretrati per restare in tempo reale. Abbassa la frequenza di analisi in Impostazioni, Prestazioni.` })
            ])
            : null,
        entry.lastError
            ? el('p', { className: 'vision-row__error' }, [icon('warning'), el('span', { textContent: entry.lastError })])
            : null
    ].filter(Boolean));
}

export function visionStatusBody(status) {
    if (!status || status.active === 0) {
        return [
            empty('Nessuna telecamera sta eseguendo analisi video. Attiva le capacita in Sistema › Telecamere › Analisi, oppure da riga di comando con argus vision enable.'),
            status?.modelsDir
                ? el('p', { className: 'xcard__note' }, [
                    icon('info'),
                    el('span', { textContent: `Cartella dei modelli: ${status.modelsDir}` })
                ])
                : null
        ].filter(Boolean);
    }

    const totalDetections = status.cameras.reduce((sum, entry) => sum + (entry.detections ?? 0), 0);
    const averageLatency = status.cameras
        .map((entry) => entry.inferenceMs)
        .filter((value) => Number.isFinite(value));

    const healthy = status.cameras.filter((entry) => entry.state === 'running' && !entry.stale).length;

    return [
        el('div', { className: 'grid grid--stats' }, [
            metricTile({ label: 'Canali analizzati', value: `${healthy}/${status.active}`, iconName: 'eye', tone: healthy === status.active ? 'emerald' : 'amber' }),
            metricTile({ label: 'Rilevamenti totali', value: String(totalDetections), iconName: 'sparkles', tone: 'purple' }),
            metricTile({
                label: 'Latenza media',
                value: averageLatency.length > 0 ? `${Math.round(averageLatency.reduce((a, b) => a + b, 0) / averageLatency.length)} ms` : '--',
                iconName: 'activity',
                tone: 'cyan'
            }),
            metricTile({
                label: 'Fotogrammi al secondo',
                value: String(Math.round(status.cameras.reduce((sum, entry) => sum + (entry.framesPerSecond ?? 0), 0) * 10) / 10),
                iconName: 'cpu',
                tone: 'blue'
            })
        ]),
        el('div', { className: 'stack stack--tight' }, status.cameras.map(cameraRow))
    ];
}
