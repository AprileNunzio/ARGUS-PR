import { el, field, chip, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

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

    const feedback = el('div', { hidden: 'hidden' });
    const saveBtn = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Salva zone' });

    const canvas = el('canvas', { className: 'zone-canvas' });
    const ctx = canvas.getContext('2d');

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
            ctx.strokeStyle = '#e74c3c';
            ctx.lineWidth = 2;
            ctx.stroke();

            for (const [px, py] of activeDrawingPoints) {
                ctx.beginPath();
                ctx.arc(px * w, py * h, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#e74c3c';
                ctx.fill();
            }
        }
    }

    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const normX = (e.clientX - rect.left) / rect.width;
        const normY = (e.clientY - rect.top) / rect.height;

        activeDrawingPoints.push([
            Math.max(0, Math.min(1, Number(normX.toFixed(3)))),
            Math.max(0, Math.min(1, Number(normY.toFixed(3))))
        ]);
        redraw();
    });

    canvas.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (activeDrawingPoints.length >= 3) {
            const newIndex = zones.length + 1;
            zones.push({
                name: `Zona ${newIndex}`,
                points: [...activeDrawingPoints],
                sensitivity: 0.015,
                cooldownSeconds: 15,
                isActive: true
            });
            activeDrawingPoints = [];
            selectedZoneIndex = zones.length - 1;
            renderZonesControls();
            redraw();
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

    return el('section', { className: 'panel' }, [
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title', textContent: `Zone di rilevamento movimento: ${camera.name}` })
        ]),
        el('div', { className: 'panel__body stack' }, [
            el('div', { className: 'zone-canvas-wrapper' }, [canvas]),
            el('div', { className: 'row' }, [
                el('button', {
                    className: 'btn btn--sm',
                    type: 'button',
                    textContent: 'Annulla vertici tracciati',
                    onclick: () => { activeDrawingPoints = []; redraw(); }
                })
            ]),
            el('hr', { className: 'divider' }),
            el('div', { className: 'section__title' }, [icon('shield'), el('span', { textContent: 'Zone configurate' })]),
            zonesList,
            feedback,
            el('div', { className: 'row row--end' }, [
                el('button', { className: 'btn', type: 'button', textContent: 'Chiudi', onclick: onCancel }),
                saveBtn
            ])
        ])
    ]);
}
