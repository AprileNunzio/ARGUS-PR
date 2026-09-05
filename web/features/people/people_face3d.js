import { el } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { buildBustMesh, meshFromLandmarks } from './face_mesh_model.js';
import { renderBust } from './face_mesh_render.js';

const meshCache = new Map();

function meshKey(params, detail) {
    const bio = params?.biometrics ?? {};
    return `${detail}|${bio.mouthToEye ?? '-'}|${bio.noseToMouth ?? '-'}|${bio.symmetry ?? '-'}`;
}

function getMesh(params, detail) {
    const key = meshKey(params, detail);
    if (!meshCache.has(key)) meshCache.set(key, buildBustMesh(params, detail));
    return meshCache.get(key);
}

function alignMeshToHead(points) {
    if (!points) return null;

    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const spanX = Math.max(...xs) - Math.min(...xs) || 1;
    const spanY = Math.max(...ys) - Math.min(...ys) || 1;
    const midX = (Math.max(...xs) + Math.min(...xs)) / 2;
    const midY = (Math.max(...ys) + Math.min(...ys)) / 2;
    const scale = Math.min(62 / spanX, 84 / spanY);

    return points.map(([x, y, z]) => [
        (x - midX) * scale,
        (y - midY) * scale + 4,
        44 + z * scale * 0.6
    ]);
}

function poseHud(params) {
    const yaw = params?.yaw ?? 0;
    const pitch = params?.pitch ?? 0;
    const roll = params?.roll ?? 0;
    return `Y ${yaw}°  P ${pitch}°  R ${roll}°`;
}

export function createFace3DCanvas(params = {}, width = 180, height = 180) {
    const canvas = el('canvas', { className: 'face3d-canvas', width: String(width), height: String(height) });
    const detail = Math.min(width, height) <= 140 ? 'low' : 'high';

    renderBust(canvas, getMesh(params, detail), {
        yaw: params?.yaw ?? 0,
        pitch: params?.pitch ?? 0,
        roll: params?.roll ?? 0,
        landmarks: alignMeshToHead(meshFromLandmarks(params?.mesh)),
        hud: detail === 'low' ? null : poseHud(params),
        zoom: 0.9
    });

    return canvas;
}

export function createFace3DViewer(params = {}, { width = 420, height = 480 } = {}) {
    const canvas = el('canvas', { className: 'face3d-canvas face3d-canvas--viewer', width: String(width), height: String(height) });
    const mesh = getMesh(params, 'high');
    const landmarks = alignMeshToHead(meshFromLandmarks(params?.mesh));

    const state = {
        yaw: params?.yaw ?? 0,
        pitch: params?.pitch ?? 0,
        roll: params?.roll ?? 0,
        facets: true,
        edges: true,
        spinning: false
    };

    let frame = 0;

    function paint() {
        renderBust(canvas, mesh, {
            yaw: state.yaw,
            pitch: state.pitch,
            roll: state.roll,
            facets: state.facets,
            edges: state.edges,
            landmarks,
            hud: poseHud(state),
            zoom: 0.94
        });
    }

    function tick() {
        if (!state.spinning || !canvas.isConnected) {
            state.spinning = false;
            return;
        }
        state.yaw = ((state.yaw + 1.1 + 180) % 360) - 180;
        paint();
        frame = requestAnimationFrame(tick);
    }

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener('pointerdown', (event) => {
        dragging = true;
        state.spinning = false;
        cancelAnimationFrame(frame);
        lastX = event.clientX;
        lastY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        state.yaw = Math.max(-180, Math.min(180, state.yaw + (event.clientX - lastX) * 0.55));
        state.pitch = Math.max(-70, Math.min(70, state.pitch - (event.clientY - lastY) * 0.45));
        lastX = event.clientX;
        lastY = event.clientY;
        paint();
    });

    const endDrag = () => { dragging = false; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    const toolButton = (label, iconName, onclick) => el('button', {
        className: 'btn btn--sm btn--ghost',
        type: 'button',
        title: label,
        onclick
    }, [icon(iconName), el('span', { textContent: label })]);

    const toolbar = el('div', { className: 'row row--tight face3d-toolbar' }, [
        toolButton('Posa rilevata', 'crop', () => {
            state.spinning = false;
            cancelAnimationFrame(frame);
            state.yaw = params?.yaw ?? 0;
            state.pitch = params?.pitch ?? 0;
            state.roll = params?.roll ?? 0;
            paint();
        }),
        toolButton('Frontale', 'users', () => {
            state.spinning = false;
            cancelAnimationFrame(frame);
            state.yaw = 0;
            state.pitch = 0;
            state.roll = 0;
            paint();
        }),
        toolButton('Wireframe', 'grid', () => {
            state.facets = !state.facets;
            if (!state.facets) state.edges = true;
            paint();
        }),
        toolButton('Ruota', 'refresh', () => {
            state.spinning = !state.spinning;
            cancelAnimationFrame(frame);
            if (state.spinning) frame = requestAnimationFrame(tick);
        })
    ]);

    paint();

    return el('div', { className: 'stack stack--tight face3d-viewer' }, [
        el('div', { className: 'face3d-stage' }, [canvas]),
        toolbar
    ]);
}

export function renderBiometricBadge(params = {}) {
    const pose = params?.pose ?? 'front';
    const poseColors = {
        front: 'ok',
        left: 'info',
        right: 'info',
        up: 'warn',
        down: 'warn'
    };
    return el('span', {
        className: `chip chip--${poseColors[pose] ?? 'info'} mono`,
        textContent: `3D: ${pose.toUpperCase()}`
    });
}
