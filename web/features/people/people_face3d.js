import { el } from '/assets/dom.js';

export function createFace3DCanvas(params = {}, width = 180, height = 180) {
    const canvas = el('canvas', { className: 'face3d-canvas', width: String(width), height: String(height) });
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const yaw = ((params?.yaw ?? 0) * Math.PI) / 180;
    const pitch = ((params?.pitch ?? 0) * Math.PI) / 180;
    const roll = ((params?.roll ?? 0) * Math.PI) / 180;

    const modelPoints = [
        [0, 50, -10],
        [-35, 45, -5],
        [35, 45, -5],
        [-40, 20, 0],
        [40, 20, 0],
        [-45, -15, 5],
        [45, -15, 5],
        [-30, -50, 10],
        [30, -50, 10],
        [0, -65, 15],
        [-22, 18, 12],
        [22, 18, 12],
        [0, 5, 28],
        [0, -8, 22],
        [-18, -30, 15],
        [18, -30, 15],
        [0, -32, 18],
        [-20, 32, 8],
        [20, 32, 8]
    ];

    const edges = [
        [0, 1], [1, 3], [3, 5], [5, 7], [7, 9],
        [0, 2], [2, 4], [4, 6], [6, 8], [8, 9],
        [1, 17], [17, 10], [2, 18], [18, 11],
        [10, 12], [11, 12], [12, 13],
        [13, 16], [14, 16], [16, 15], [14, 7], [15, 8],
        [10, 11], [14, 15], [7, 9], [8, 9]
    ];

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(0, 0, width, height, 8) : ctx.rect(0, 0, width, height);
    ctx.fill();

    const cx = width / 2;
    const cy = height / 2;
    const fov = 200;

    const projected = modelPoints.map(([px, py, pz]) => {
        let x = px * Math.cos(roll) - py * Math.sin(roll);
        let y = px * Math.sin(roll) + py * Math.cos(roll);
        let z = pz;

        const y2 = y * Math.cos(pitch) - z * Math.sin(pitch);
        const z2 = y * Math.sin(pitch) + z * Math.cos(pitch);
        y = y2;
        z = z2;

        const x3 = x * Math.cos(yaw) + z * Math.sin(yaw);
        const z3 = -x * Math.sin(yaw) + z * Math.cos(yaw);
        x = x3;
        z = z3;

        const depth = fov / (fov - z);
        return [cx + x * depth, cy - y * depth, z];
    });

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1.2;
    for (const [i, j] of edges) {
        const p1 = projected[i];
        const p2 = projected[j];
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
    }

    for (let i = 0; i < projected.length; i += 1) {
        const p = projected[i];
        ctx.fillStyle = i === 12 ? '#38bdf8' : (i === 10 || i === 11 ? '#34d399' : '#94a3b8');
        ctx.beginPath();
        ctx.arc(p[0], p[1], i === 12 ? 3 : 2, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`Y:${params?.yaw ?? 0}° P:${params?.pitch ?? 0}° R:${params?.roll ?? 0}°`, 8, height - 8);

    return canvas;
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
