const MODEL_CENTER_Y = -66;
const MODEL_HALF_HEIGHT = 128;
const CAMERA_DISTANCE = 620;
const LIGHT = normalise([-0.42, 0.52, 0.75]);

function normalise(vector) {
    const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
    return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function rotate(point, yaw, pitch, roll) {
    const [px, py, pz] = point;

    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    let x = px * cr - py * sr;
    let y = px * sr + py * cr;
    let z = pz;

    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const y1 = y * cp - z * sp;
    const z1 = y * sp + z * cp;
    y = y1;
    z = z1;

    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const x1 = x * cy + z * sy;
    const z2 = -x * sy + z * cy;
    x = x1;
    z = z2;

    return [x, y, z];
}

function faceNormal(a, b, c) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    return normalise([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
}

function paintBackdrop(ctx, width, height, theme) {
    const gradient = ctx.createRadialGradient(width * 0.5, height * 0.42, 8, width * 0.5, height * 0.5, Math.max(width, height) * 0.75);
    gradient.addColorStop(0, theme.backdropInner);
    gradient.addColorStop(1, theme.backdropOuter);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
}

const THEMES = Object.freeze({
    scan: {
        backdropInner: 'rgba(30, 41, 59, 0.95)',
        backdropOuter: 'rgba(2, 6, 23, 0.98)',
        facetLow: [96, 116, 158],
        facetHigh: [226, 236, 255],
        edge: 'rgba(8, 15, 32, 0.55)',
        point: '#38bdf8',
        anchor: '#34d399',
        hud: 'rgba(148, 163, 184, 0.9)'
    }
});

export function renderBust(canvas, mesh, options = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const theme = THEMES[options.theme] ?? THEMES.scan;
    const yaw = ((options.yaw ?? 0) * Math.PI) / 180;
    const pitch = ((options.pitch ?? 0) * Math.PI) / 180;
    const roll = ((options.roll ?? 0) * Math.PI) / 180;
    const showEdges = options.edges !== false;
    const showFacets = options.facets !== false;

    ctx.clearRect(0, 0, width, height);
    paintBackdrop(ctx, width, height, theme);

    const scale = (height / (MODEL_HALF_HEIGHT * 2)) * (options.zoom ?? 0.92);
    const cx = width / 2;
    const cy = height / 2;

    const view = mesh.vertices.map((vertex) => rotate([vertex[0], vertex[1] - MODEL_CENTER_Y, vertex[2]], yaw, pitch, roll));
    const screen = view.map(([x, y, z]) => {
        const depth = CAMERA_DISTANCE / (CAMERA_DISTANCE - z * scale);
        return [cx + x * scale * depth, cy - y * scale * depth];
    });

    const facets = [];
    for (const quad of mesh.quads) {
        const a = view[quad[0]];
        const b = view[quad[1]];
        const c = view[quad[2]];
        const normal = faceNormal(a, b, c);
        if (normal[2] <= 0.02) continue;

        const depth = (a[2] + b[2] + c[2] + view[quad[3]][2]) / 4;
        facets.push({ quad, normal, depth });
    }

    facets.sort((left, right) => left.depth - right.depth);

    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(0.35, width / 620);

    for (const facet of facets) {
        const lambert = Math.max(0, facet.normal[0] * LIGHT[0] + facet.normal[1] * LIGHT[1] + facet.normal[2] * LIGHT[2]);
        const mix = 0.24 + 0.76 * lambert;

        ctx.beginPath();
        const first = screen[facet.quad[0]];
        ctx.moveTo(first[0], first[1]);
        for (let i = 1; i < 4; i += 1) {
            const point = screen[facet.quad[i]];
            ctx.lineTo(point[0], point[1]);
        }
        ctx.closePath();

        if (showFacets) {
            const channel = (index) => Math.round(theme.facetLow[index] + (theme.facetHigh[index] - theme.facetLow[index]) * mix);
            ctx.fillStyle = `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
            ctx.fill();
        }
        if (showEdges) {
            ctx.strokeStyle = theme.edge;
            ctx.stroke();
        }
    }

    if (Array.isArray(options.landmarks) && options.landmarks.length > 0) {
        for (const point of options.landmarks) {
            const [x, y, z] = rotate([point[0], point[1] - MODEL_CENTER_Y, point[2]], yaw, pitch, roll);
            if (z < -10) continue;
            const depth = CAMERA_DISTANCE / (CAMERA_DISTANCE - z * scale);
            ctx.fillStyle = theme.point;
            ctx.beginPath();
            ctx.arc(cx + x * scale * depth, cy - y * scale * depth, Math.max(0.9, width / 260), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    if (options.hud) {
        ctx.font = `${Math.max(9, Math.round(width / 28))}px ui-monospace, monospace`;
        ctx.fillStyle = theme.hud;
        ctx.fillText(options.hud, 8, height - 8);
    }
}
