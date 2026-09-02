import { el, chip, field, notice, formatBytes } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

export function renderPerformancePanel({ api }) {
    const root = el('section', { className: 'panel rise rise-4' });
    const feedback = el('div', { hidden: 'hidden' });
    const formHost = el('div', { className: 'stack' });

    let currentHardware = null;
    let currentPerf = null;

    async function refresh() {
        const data = await api.get('/api/system/performance').catch(() => null);
        if (!data) return;

        currentHardware = data.hardware;
        currentPerf = data.performance;
        renderForm();
    }

    function renderForm() {
        if (!currentHardware || !currentPerf) return;

        const hw = currentHardware;
        const perf = currentPerf;

        const hwStats = el('div', { className: 'grid grid--stats' }, [
            el('div', { className: 'stat' }, [
                el('span', { className: 'stat__icon' }, [icon('cpu', { className: 'icon--lg' })]),
                el('div', { className: 'stat__body' }, [
                    el('span', { className: 'stat__value', textContent: `${hw.cpu.logicalCores} Thread` }),
                    el('span', { className: 'stat__label', textContent: hw.cpu.model }),
                    el('span', { className: 'stat__hint', textContent: `${hw.cpu.arch} · Max Performance Multi-Core` })
                ])
            ]),
            el('div', { className: 'stat' }, [
                el('span', { className: 'stat__icon' }, [icon('memory', { className: 'icon--lg' })]),
                el('div', { className: 'stat__body' }, [
                    el('span', { className: 'stat__value', textContent: formatBytes(hw.memory.freeBytes) }),
                    el('span', { className: 'stat__label', textContent: `Memoria Libera su ${formatBytes(hw.memory.totalBytes)}` }),
                    el('span', { className: 'stat__hint', textContent: `Cache SQLite: ${perf.sqliteCacheSizeMb} MB allocati` })
                ])
            ]),
            el('div', { className: 'stat' }, [
                el('span', { className: 'stat__icon' }, [icon('zap', { className: 'icon--lg' })]),
                el('div', { className: 'stat__body' }, [
                    el('span', { className: 'stat__value', textContent: perf.hwaccelBackend.toUpperCase() }),
                    el('span', { className: 'stat__label', textContent: 'Accelerazione Video GPU' }),
                    el('span', { className: 'stat__hint', textContent: hw.accelerators.join(', ') || 'Nessuna GPU rilevata' })
                ])
            ]),
            el('div', { className: 'stat' }, [
                el('span', { className: 'stat__icon' }, [icon('sparkles', { className: 'icon--lg' })]),
                el('div', { className: 'stat__body' }, [
                    el('span', { className: 'stat__value', textContent: perf.aiExecutionProvider.replace('ExecutionProvider', '') }),
                    el('span', { className: 'stat__label', textContent: 'Motore di Inferenza AI' }),
                    el('span', { className: 'stat__hint', textContent: 'YOLOX, YuNet, SFace, ANPR' })
                ])
            ])
        ]);

        const hwaccelSelect = el('select', { className: 'input' }, [
            el('option', { value: 'auto', textContent: 'Auto (Consigliato: usa GPU se disponibile)' }),
            el('option', { value: 'cuda', textContent: 'NVIDIA CUDA (Massime prestazioni GPU)' }),
            el('option', { value: 'qsv', textContent: 'Intel QuickSync (QSV)' }),
            el('option', { value: 'd3d11va', textContent: 'DirectX 11 (D3D11VA Windows)' }),
            el('option', { value: 'vaapi', textContent: 'Linux VAAPI' }),
            el('option', { value: 'videotoolbox', textContent: 'Apple VideoToolbox (macOS/Metal)' }),
            el('option', { value: 'amf', textContent: 'AMD AMF' }),
            el('option', { value: 'none', textContent: 'Disabilitato (Solo CPU)' })
        ]);
        hwaccelSelect.value = perf.hwaccelBackend;

        const encoderSelect = el('select', { className: 'input' }, [
            el('option', { value: 'auto', textContent: 'Auto (Seleziona encoder GPU prioritario)' }),
            el('option', { value: 'h264_nvenc', textContent: 'NVIDIA NVENC (h264_nvenc)' }),
            el('option', { value: 'h264_qsv', textContent: 'Intel QuickSync (h264_qsv)' }),
            el('option', { value: 'h264_amf', textContent: 'AMD AMF (h264_amf)' }),
            el('option', { value: 'h264_vaapi', textContent: 'Linux VAAPI (h264_vaapi)' }),
            el('option', { value: 'h264_videotoolbox', textContent: 'Apple VideoToolbox (h264_videotoolbox)' }),
            el('option', { value: 'libx264', textContent: 'CPU Software (libx264 veryfast)' })
        ]);
        encoderSelect.value = perf.videoEncoder;

        const aiSelect = el('select', { className: 'input' }, [
            el('option', { value: 'auto', textContent: 'Auto (Priorità CUDA > DirectML > CPU)' }),
            el('option', { value: 'CUDAExecutionProvider', textContent: 'NVIDIA CUDA / Tensor Core' }),
            el('option', { value: 'TensorrtExecutionProvider', textContent: 'NVIDIA TensorRT' }),
            el('option', { value: 'DmlExecutionProvider', textContent: 'DirectML (Tutte le GPU su Windows)' }),
            el('option', { value: 'OpenVINOExecutionProvider', textContent: 'Intel OpenVINO (iGPU / NPU)' }),
            el('option', { value: 'CPUExecutionProvider', textContent: 'CPU Multithread' })
        ]);
        aiSelect.value = perf.aiExecutionProvider;

        const cpuThreadsInput = el('input', {
            className: 'input',
            type: 'number',
            min: '0',
            max: String(hw.cpu.logicalCores * 2),
            value: String(perf.cpuThreads)
        });

        const sqliteCacheSelect = el('select', { className: 'input' }, [
            el('option', { value: '64', textContent: '64 MB RAM' }),
            el('option', { value: '128', textContent: '128 MB RAM (Default bilanciato)' }),
            el('option', { value: '256', textContent: '256 MB RAM (Alte prestazioni)' }),
            el('option', { value: '512', textContent: '512 MB RAM (Server dedicato)' }),
            el('option', { value: '1024', textContent: '1024 MB RAM (Massime prestazioni)' }),
            el('option', { value: '2048', textContent: '2048 MB RAM (Extreme)' })
        ]);
        sqliteCacheSelect.value = String(perf.sqliteCacheSizeMb);

        const sqliteMmapSelect = el('select', { className: 'input' }, [
            el('option', { value: '128', textContent: '128 MB' }),
            el('option', { value: '256', textContent: '256 MB' }),
            el('option', { value: '512', textContent: '512 MB (Default)' }),
            el('option', { value: '1024', textContent: '1024 MB' }),
            el('option', { value: '2048', textContent: '2048 MB (Extreme I/O)' }),
            el('option', { value: '4096', textContent: '4096 MB (Massimo)' })
        ]);
        sqliteMmapSelect.value = String(perf.sqliteMmapSizeMb);

        const ringBufferSelect = el('select', { className: 'input' }, [
            el('option', { value: '2048', textContent: '2 MB (Risparmio RAM)' }),
            el('option', { value: '4096', textContent: '4 MB (Default fluido)' }),
            el('option', { value: '8192', textContent: '8 MB (Massima stabilità stream)' }),
            el('option', { value: '16384', textContent: '16 MB (Multi-client pesante)' })
        ]);
        ringBufferSelect.value = String(perf.streamRingBufferKb);

        function applyPreset(preset) {
            if (preset === 'max_performance') {
                hwaccelSelect.value = 'auto';
                encoderSelect.value = 'auto';
                aiSelect.value = 'auto';
                cpuThreadsInput.value = '0';
                sqliteCacheSelect.value = '512';
                sqliteMmapSelect.value = '2048';
                ringBufferSelect.value = '8192';
            } else if (preset === 'balanced') {
                hwaccelSelect.value = 'auto';
                encoderSelect.value = 'auto';
                aiSelect.value = 'auto';
                cpuThreadsInput.value = String(Math.max(1, Math.floor(hw.cpu.logicalCores * 0.75)));
                sqliteCacheSelect.value = '128';
                sqliteMmapSelect.value = '512';
                ringBufferSelect.value = '4096';
            } else if (preset === 'power_saving') {
                hwaccelSelect.value = 'none';
                encoderSelect.value = 'libx264';
                aiSelect.value = 'CPUExecutionProvider';
                cpuThreadsInput.value = '1';
                sqliteCacheSelect.value = '64';
                sqliteMmapSelect.value = '128';
                ringBufferSelect.value = '2048';
            }
        }

        const presetButtons = [
            el('button', {
                className: 'btn btn--sm',
                type: 'button',
                onclick: () => applyPreset('max_performance')
            }, [icon('zap'), el('span', { textContent: 'Massime Prestazioni (Full GPU + RAM)' })]),
            el('button', {
                className: 'btn btn--sm',
                type: 'button',
                onclick: () => applyPreset('balanced')
            }, [icon('activity'), el('span', { textContent: 'Bilanciato' })]),
            el('button', {
                className: 'btn btn--sm',
                type: 'button',
                onclick: () => applyPreset('power_saving')
            }, [icon('sun'), el('span', { textContent: 'Risparmio Energetico' })])
        ];

        const saveBtn = el('button', {
            className: 'btn btn--primary',
            type: 'submit',
            textContent: 'Salva & Applica Ottimizzazioni'
        });

        const form = el('form', { className: 'stack' }, [
            hwStats,
            el('div', { className: 'row schedule-presets' }, presetButtons),
            el('div', { className: 'form-grid' }, [
                field('Acceleratore Hardware Video (GPU / NPU)', hwaccelSelect),
                field('Encoder Transcodifica Hardware', encoderSelect),
                field('Motore di Calcolo Visione AI', aiSelect),
                field('Thread CPU per Processi (0 = Auto tutti i core)', cpuThreadsInput),
                field('Page Cache SQLite in RAM', sqliteCacheSelect),
                field('Memoria Mappata SQLite (mmap)', sqliteMmapSelect),
                field('Ring Buffer Streaming Web in RAM', ringBufferSelect)
            ]),
            feedback,
            el('div', { className: 'row row--end' }, [saveBtn])
        ]);

        form.onsubmit = async (e) => {
            e.preventDefault();
            saveBtn.disabled = true;
            feedback.setAttribute('hidden', 'hidden');

            const payload = {
                hwaccelBackend: hwaccelSelect.value,
                videoEncoder: encoderSelect.value,
                aiExecutionProvider: aiSelect.value,
                cpuThreads: Number(cpuThreadsInput.value) || 0,
                sqliteCacheSizeMb: Number(sqliteCacheSelect.value) || 128,
                sqliteMmapSizeMb: Number(sqliteMmapSelect.value) || 512,
                streamRingBufferKb: Number(ringBufferSelect.value) || 4096
            };

            const outcome = await api.put('/api/system/performance', payload).then((res) => res).catch((err) => err);
            saveBtn.disabled = false;

            if (outcome instanceof Error) {
                feedback.replaceChildren(notice('error', outcome.message));
                feedback.removeAttribute('hidden');
                return;
            }

            currentPerf = outcome.performance;
            feedback.replaceChildren(notice('ok', 'Configurazione hardware e prestazioni applicata con successo a caldo.'));
            feedback.removeAttribute('hidden');
        };

        formHost.replaceChildren(form);
    }

    root.replaceChildren(
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title' }, [icon('zap'), 'Prestazioni & Accelerazione Hardware'])
        ]),
        el('div', { className: 'panel__body stack' }, [formHost])
    );

    refresh();

    return {
        element: root,
        refresh
    };
}
