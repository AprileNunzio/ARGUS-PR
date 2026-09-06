import { el, field, chip, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { createLivePlayer, isPlaybackSupported } from '/features/live/player.js';

const ZONE_COLORS = [
    'rgba(41, 128, 185, 0.4)',
    'rgba(39, 174, 96, 0.4)',
    'rgba(211, 84, 0, 0.4)',
    'rgba(142, 68, 173, 0.4)',
    'rgba(22, 160, 133, 0.4)',
    'rgba(192, 57, 43, 0.4)'
];

const ZONE_STROKES = [
    '#2980b9', '#27ae60', '#d35400', '#8e44ad', '#16a085', '#c0392b'
];

export function renderZoneEditor({ camera, api, onSaved, onCancel }) {
    let zones = [];
    let activeDrawingPoints = [];
    let selectedZoneIndex = -1;
    let cursorPoint = null;

    const hint = el('p', { className: 'zone-hint' });

    const updateHint = () => {
        const count = activeDrawingPoints.length;
        if (count === 0) {
            hint.textContent = 'Clicca sul video per posare il primo vertice della zona.';
            return;
        }
        if (count < 3) {
            hint.textContent = `${count} ${count === 1 ? 'vertice posato' : 'vertici posati'}: servono almeno tre punti per chiudere una zona.`;
            return;
        }
        hint.textContent = `${count} vertici posati. Doppio clic per chiudere la zona, oppure continua ad aggiungere punti.`;
    };

    updateHint();

    const feedback = el('div', { hidden: 'hidden' });
    const saveBtn = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Salva zone' });

    const canvas = el('canvas', { className: 'zone-canvas' });
    const ctx = canvas.getContext('2d');

    const preview = el('video', { className: 'zone-preview', autoplay: 'autoplay', playsinline: 'playsinline' });
    preview.muted = true;

    const previewState = el('span', { className: 'zone-preview__state' }, [
        icon('camera'),
        el('span', { textContent: 'Collegamento alla telecamera…' })
    ]);

    const player = isPlaybackSupported()
        ? createLivePlayer(preview, camera.id, {
            quality: 'sub',
            onState: (value) => {
                previewState.hidden = value === 'live';
                const label = previewState.querySelector('span');
                if (label) {
                    label.textContent = value === 'unsupported'
                        ? 'Anteprima non supportata da questo browser'
                        : (value === 'reconnecting' ? 'Riconnessione alla telecamera…' : 'Collegamento alla telecamera…');
                }
            }
        })
        : null;

    if (!player) {
        const label = previewState.querySelector('span');
        if (label) label.textContent = 'Anteprima non supportata da questo browser';
    }

    const zonesList = el('div', { className: 'stack' });

    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * (window.devicePixelRatio || 1);
        canvas.height = rect.height * (window.devicePixelRatio || 1);
        redraw();
    }

    function redraw() {
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        zones.forEach((zone, index) => {
            if (!zone.points || zone.points.length < 3) return;

            ctx.beginPath();
            const [startX, startY] = zone.points[0];
            ctx.moveTo(startX * w, startY * h);

            for (let i = 1; i < zone.points.length; i += 1) {
                const [px, py] = zone.points[i];
                ctx.lineTo(px * w, py * h);
            }
            ctx.closePath();

            ctx.fillStyle = ZONE_COLORS[index % ZONE_COLORS.length];
            ctx.fill();

            ctx.strokeStyle = ZONE_STROKES[index % ZONE_STROKES.length];
            ctx.lineWidth = index === selectedZoneIndex ? 4 : 2;
            ctx.stroke();

            const [labelX, labelY] = zone.points[0];
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(zone.name || `Zona ${index + 1}`, labelX * w + 6, labelY * h + 16);
        });

        if (activeDrawingPoints.length > 0) {
            ctx.beginPath();
            ctx.moveTo(activeDrawingPoints[0][0] * w, activeDrawingPoints[0][1] * h);
            for (let i = 1; i < activeDrawingPoints.length; i += 1) {
                ctx.lineTo(activeDrawingPoints[i][0] * w, activeDrawingPoints[i][1] * h);
            }

            if (cursorPoint) ctx.lineTo(cursorPoint[0] * w, cursorPoint[1] * h);

            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.setLineDash(cursorPoint ? [7, 5] : []);
            ctx.stroke();
            ctx.setLineDash([]);

            if (activeDrawingPoints.length >= 3) {
                ctx.beginPath();
                ctx.moveTo(activeDrawingPoints[0][0] * w, activeDrawingPoints[0][1] * h);
                for (let i = 1; i < activeDrawingPoints.length; i += 1) {
                    ctx.lineTo(activeDrawingPoints[i][0] * w, activeDrawingPoints[i][1] * h);
                }
                ctx.closePath();
                ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
                ctx.fill();
            }

            activeDrawingPoints.forEach(([px, py], index) => {
                ctx.beginPath();
                ctx.arc(px * w, py * h, index === 0 ? 7 : 5, 0, Math.PI * 2);
                ctx.fillStyle = index === 0 ? '#0ea5e9' : '#38bdf8';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();
            });
        }
    }

    const pointFrom = (event) => {
        const rect = canvas.getBoundingClientRect();
        return [
            Math.max(0, Math.min(1, Number(((event.clientX - rect.left) / rect.width).toFixed(3)))),
            Math.max(0, Math.min(1, Number(((event.clientY - rect.top) / rect.height).toFixed(3))))
        ];
    };

    canvas.addEventListener('click', (event) => {
        activeDrawingPoints.push(pointFrom(event));
        updateHint();
        redraw();
    });

    canvas.addEventListener('mousemove', (event) => {
        if (activeDrawingPoints.length === 0) {
            cursorPoint = null;
            return;
        }
        cursorPoint = pointFrom(event);
        redraw();
    });

    canvas.addEventListener('mouseleave', () => {
        cursorPoint = null;
        redraw();
    });

    const addZone = (name, points) => {
        zones.push({
            name,
            points,
            sensitivity: 0.015,
            cooldownSeconds: 15,
            isActive: true
        });
        activeDrawingPoints = [];
        cursorPoint = null;
        selectedZoneIndex = zones.length - 1;
        updateHint();
        renderZonesControls();
        redraw();
    };

    const PRESETS = [
        { label: 'Tutta l inquadratura', points: [[0.02, 0.02], [0.98, 0.02], [0.98, 0.98], [0.02, 0.98]] },
        { label: 'Meta superiore', points: [[0.02, 0.02], [0.98, 0.02], [0.98, 0.5], [0.02, 0.5]] },
        { label: 'Meta inferiore', points: [[0.02, 0.5], [0.98, 0.5], [0.98, 0.98], [0.02, 0.98]] },
        { label: 'Fascia centrale', points: [[0.02, 0.3], [0.98, 0.3], [0.98, 0.7], [0.02, 0.7]] }
    ];

    const presetBar = el('div', { className: 'zone-presets' }, [
        el('span', { className: 'zone-presets__label', textContent: 'Preset rapidi:' }),
        ...PRESETS.map((preset) => el('button', {
            className: 'btn btn--sm',
            type: 'button',
            textContent: preset.label,
            onclick: () => addZone(preset.label, preset.points.map((point) => [...point]))
        }))
    ]);

    canvas.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (activeDrawingPoints.length >= 3) {
            addZone(`Zona ${zones.length + 1}`, [...activeDrawingPoints]);
        }
    });

    function renderZonesControls() {
        zonesList.replaceChildren();

        if (zones.length === 0) {
            zonesList.append(el('div', {
                className: 'section__hint',
                textContent: 'Nessuna zona definita. Clicca sul riquadro per tracciare i vertici e fai doppio clic per chiudere la zona.'
            }));
            return;
        }

        zones.forEach((zone, index) => {
            const nameInput = el('input', {
                className: 'input input--sm',
                type: 'text',
                value: zone.name,
                oninput: () => { zone.name = nameInput.value; redraw(); }
            });

            const sensSlider = el('input', {
                type: 'range',
                min: '0.001',
                max: '0.100',
                step: '0.001',
                value: String(zone.sensitivity ?? 0.015)
            });
            const sensLabel = el('span', { className: 'mono', textContent: `${((zone.sensitivity ?? 0.015) * 100).toFixed(1)}%` });

            sensSlider.oninput = () => {
                zone.sensitivity = Number(sensSlider.value);
                sensLabel.textContent = `${(zone.sensitivity * 100).toFixed(1)}%`;
            };

            const coolInput = el('input', {
                className: 'input input--sm',
                type: 'number',
                min: '1',
                max: '300',
                value: String(zone.cooldownSeconds ?? 15),
                oninput: () => { zone.cooldownSeconds = Number(coolInput.value); }
            });

            const deleteBtn = el('button', {
                className: 'btn btn--sm btn--danger',
                type: 'button',
                textContent: 'Elimina',
                onclick: () => {
                    zones.splice(index, 1);
                    selectedZoneIndex = -1;
                    renderZonesControls();
                    redraw();
                }
            });

            const card = el('div', {
                className: 'device-row',
                onclick: () => { selectedZoneIndex = index; redraw(); }
            }, [
                el('div', { className: 'stack' }, [
                    el('div', { className: 'row' }, [
                        el('span', { className: 'chip', textContent: `#${index + 1}` }),
                        nameInput
                    ]),
                    el('div', { className: 'row' }, [
                        el('span', { className: 'section__hint', textContent: 'Sensibilità area:' }),
                        sensSlider,
                        sensLabel,
                        el('span', { className: 'section__hint', textContent: 'Attesa (sec):' }),
                        coolInput
                    ])
                ]),
                deleteBtn
            ]);

            zonesList.append(card);
        });
    }

    saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        feedback.setAttribute('hidden', 'hidden');

        const outcome = await api.put(`/api/cameras/${camera.id}/motion/zones`, { zones })
            .then(() => null)
            .catch((err) => err);

        saveBtn.disabled = false;
        if (outcome instanceof Error) {
            feedback.replaceChildren(notice('error', outcome.message));
            feedback.removeAttribute('hidden');
            return;
        }

        onSaved();
    };

    api.get(`/api/cameras/${camera.id}/motion/zones`).then(({ zones: fetched }) => {
        zones = fetched ?? [];
        renderZonesControls();
        setTimeout(resizeCanvas, 50);
    }).catch(() => {
        renderZonesControls();
        setTimeout(resizeCanvas, 50);
    });

    window.addEventListener('resize', resizeCanvas);

    const root = el('section', { className: 'panel' }, [
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title', textContent: `Zone di rilevamento movimento: ${camera.name}` })
        ]),
        el('div', { className: 'panel__body stack' }, [
            el('div', { className: 'zone-canvas-wrapper' }, [preview, canvas, previewState]),
            hint,
            el('div', { className: 'row row--between' }, [
                presetBar,
                el('button', {
                    className: 'btn btn--sm',
                    type: 'button',
                    onclick: () => {
                        activeDrawingPoints = [];
                        cursorPoint = null;
                        updateHint();
                        redraw();
                    }
                }, [icon('close'), el('span', { textContent: 'Annulla vertici' })])
            ]),
            el('hr', { className: 'divider' }),
            el('div', { className: 'section__title' }, [icon('shield'), el('span', { textContent: 'Zone configurate' })]),
            zonesList,
            feedback,
            el('div', { className: 'row row--end' }, [
                el('button', {
                    className: 'btn',
                    type: 'button',
                    textContent: 'Chiudi',
                    onclick: () => {
                        player?.destroy();
                        onCancel();
                    }
                }),
                saveBtn
            ])
        ])
    ]);

    root.addEventListener('argus:teardown', () => {
        player?.destroy();
        window.removeEventListener('resize', resizeCanvas);
    });

    return root;
}
