import { el, chip, empty, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { go } from '/assets/router.js';

export async function renderFloorplanView({ api, session }) {
    const outlet = el('div', { className: 'view' });
    const { floorPlans = [] } = await api.get('/api/floorplans').catch(() => ({ floorPlans: [] }));

    let activePlan = floorPlans[0] || null;
    let markers = [];

    const planSelect = el('select', {
        className: 'select',
        onchange: async (e) => {
            activePlan = floorPlans.find((p) => p.id === e.target.value) || null;
            await loadPlan();
        }
    }, floorPlans.map((p) => el('option', { value: p.id, textContent: p.name })));

    const canvas = el('canvas', { className: 'floorplan-canvas' });
    const ctx = canvas.getContext('2d');
    let mapImage = new Image();

    async function loadPlan() {
        if (!activePlan) {
            outlet.replaceChildren(empty('Nessuna planimetria caricata. Crea una mappa in Impostazioni.'));
            return;
        }

        const data = await api.get(`/api/floorplans/${encodeURIComponent(activePlan.id)}/markers`).catch(() => ({ markers: [] }));
        markers = data.markers || [];

        mapImage = new Image();
        mapImage.onload = () => draw();
        mapImage.src = activePlan.imagePath;
    }

    function draw() {
        if (!activePlan) return;
        canvas.width = activePlan.width || 800;
        canvas.height = activePlan.height || 600;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (mapImage.complete && mapImage.naturalWidth > 0) {
            ctx.drawImage(mapImage, 0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        for (const marker of markers) {
            ctx.save();
            ctx.translate(marker.x, marker.y);

            const startRad = ((marker.fovAngle - (marker.fovRange / 2)) * Math.PI) / 180;
            const endRad = ((marker.fovAngle + (marker.fovRange / 2)) * Math.PI) / 180;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, 100, startRad, endRad);
            ctx.closePath();
            ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, 2 * Math.PI);
            ctx.fillStyle = '#3b82f6';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = '12px Inter, sans-serif';
            ctx.fillText(marker.cameraName || marker.cameraId, 14, 4);

            ctx.restore();
        }
    }

    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clickX = (e.clientX - rect.left) * scaleX;
        const clickY = (e.clientY - rect.top) * scaleY;

        for (const marker of markers) {
            const dist = Math.hypot(marker.x - clickX, marker.y - clickY);
            if (dist <= 20) {
                go('live');
                break;
            }
        }
    });

    outlet.replaceChildren(
        el('div', { className: 'view__head' }, [
            el('h1', { className: 'view__title', textContent: 'Planimetria Interattiva' }),
            el('div', { className: 'row row--tight' }, [planSelect])
        ]),
        el('section', { className: 'panel' }, [
            el('div', { className: 'panel__body' }, [canvas])
        ])
    );

    await loadPlan();
    return outlet;
}
