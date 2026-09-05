const HEAD_PROFILE = [
    [0.00, 8, 11, 13, 2, 2.0],
    [0.07, 22, 26, 30, 1, 2.0],
    [0.16, 33, 36, 42, 0, 2.1],
    [0.27, 38, 41, 47, -1, 2.2],
    [0.38, 40, 44, 49, -1, 2.2],
    [0.46, 41, 44, 49, 0, 2.2],
    [0.55, 40, 45, 48, 0, 2.2],
    [0.64, 38, 45, 46, 1, 2.1],
    [0.73, 34, 42, 43, 2, 2.0],
    [0.82, 29, 38, 39, 3, 2.0],
    [0.89, 25, 34, 35, 3, 2.0],
    [0.94, 19, 27, 30, 0, 2.0],
    [0.97, 15, 21, 26, -5, 2.0],
    [1.00, 14, 19, 24, -8, 2.0]
];

const BODY_PROFILE = [
    [1.00, 14, 19, 24, -8, 2.0],
    [1.05, 15, 20, 24, -8, 2.0],
    [1.09, 19, 21, 25, -8, 2.2],
    [1.16, 43, 26, 30, -7, 2.9],
    [1.24, 68, 30, 34, -6, 3.4],
    [1.30, 73, 32, 36, -5, 3.5],
    [1.46, 72, 33, 37, -4, 3.4],
    [1.64, 67, 32, 36, -2, 3.2],
    [1.80, 57, 30, 33, -1, 3.0],
    [1.92, 46, 28, 31, 0, 2.8],
    [1.98, 41, 26, 29, 0, 2.7]
];

const BUST_BOTTOM_Y = -152;

const HEAD_TOP_Y = 52;
const UNIT_Y = 100;

function sampleProfile(table, t) {
    if (t <= table[0][0]) return table[0].slice(1);
    if (t >= table[table.length - 1][0]) return table[table.length - 1].slice(1);

    for (let i = 1; i < table.length; i += 1) {
        if (t > table[i][0]) continue;
        const [t0, ...a] = table[i - 1];
        const [t1, ...b] = table[i];
        const span = t1 - t0 || 1;
        const k = (t - t0) / span;
        return a.map((value, index) => value + (b[index] - value) * k);
    }
    return table[table.length - 1].slice(1);
}

function gaussian(value, sigma) {
    const ratio = value / sigma;
    return Math.exp(-ratio * ratio);
}

function normaliseBiometrics(params) {
    const source = params?.biometrics ?? {};
    const clamp = (value, min, max, fallback) => (
        Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
    );
    return {
        eyeSpread: clamp(source.mouthToEye ? 1.9 / source.mouthToEye : NaN, 0.82, 1.18, 1),
        mouthWidth: clamp(source.mouthToEye, 0.7, 1.6, 1.05) / 1.05,
        noseLength: clamp(source.noseToMouth, 0.5, 1.5, 0.95) / 0.95,
        skew: clamp(source.symmetry, 0.75, 1, 1)
    };
}

function facialRelief(u, t, bio) {
    if (t < 0.24 || t > 0.98) return 0;

    const au = Math.abs(u);
    let dz = 0;

    dz += 3.4 * gaussian(t - 0.415, 0.038) * gaussian(u, 0.62);
    dz -= 4.2 * gaussian(au - 0.40 * bio.eyeSpread, 0.15) * gaussian(t - 0.485, 0.048);
    dz += 1.6 * gaussian(au - 0.40 * bio.eyeSpread, 0.09) * gaussian(t - 0.505, 0.022);

    const noseTip = 0.605 + 0.04 * (bio.noseLength - 1);
    const noseRise = Math.max(0, Math.min(1, (t - 0.415) / (noseTip - 0.415)));
    const noseFall = t > noseTip ? Math.max(0, 1 - (t - noseTip) / 0.055) : 1;
    dz += 12 * gaussian(u, 0.155) * Math.pow(noseRise, 1.5) * noseFall;
    dz += 3.4 * gaussian(u, 0.26) * gaussian(t - noseTip, 0.028);
    dz -= 2.6 * gaussian(au - 0.20, 0.05) * gaussian(t - (noseTip + 0.012), 0.020);

    dz += 2.6 * gaussian(au - 0.56, 0.26) * gaussian(t - 0.615, 0.10);
    dz -= 1.2 * gaussian(u, 0.075) * gaussian(t - 0.685, 0.022);

    const mouthT = 0.735;
    dz += 2.9 * gaussian(u, 0.30 * bio.mouthWidth) * gaussian(t - mouthT, 0.030);
    dz -= 2.0 * gaussian(u, 0.34 * bio.mouthWidth) * gaussian(t - (mouthT + 0.022), 0.010);
    dz += 2.2 * gaussian(u, 0.26 * bio.mouthWidth) * gaussian(t - (mouthT + 0.048), 0.026);

    dz -= 1.8 * gaussian(u, 0.30) * gaussian(t - 0.805, 0.028);
    dz += 3.6 * gaussian(u, 0.32) * gaussian(t - 0.862, 0.052);

    dz -= 2.0 * gaussian(au - 0.86, 0.14) * gaussian(t - 0.30, 0.12);

    return dz;
}

function earOffset(u, t) {
    if (t < 0.42 || t > 0.74) return 0;
    return 4.2 * gaussian(t - 0.575, 0.075) * gaussian(Math.abs(u) - 1, 0.10);
}

function buildRing(t, segments, bio, isHead) {
    const [halfWidth, frontDepth, backDepth, zCenter, squareness] = sampleProfile(isHead ? HEAD_PROFILE : BODY_PROFILE, t);
    const y = HEAD_TOP_Y - t * UNIT_Y;
    const power = 2 / Math.max(1.6, squareness ?? 2);
    const ring = [];

    for (let s = 0; s < segments; s += 1) {
        const angle = (s / segments) * Math.PI * 2;
        const rawLateral = Math.sin(angle);
        const rawSagittal = Math.cos(angle);
        const lateral = Math.sign(rawLateral) * Math.abs(rawLateral) ** power;
        const sagittal = Math.sign(rawSagittal) * Math.abs(rawSagittal) ** power;
        const depth = rawSagittal >= 0 ? frontDepth : backDepth;

        let x = halfWidth * lateral;
        let z = zCenter + depth * sagittal;

        if (isHead) {
            const u = halfWidth > 0 ? x / halfWidth : 0;
            if (rawSagittal > 0) {
                z += facialRelief(u, t, bio) * rawSagittal;
            }
            x += Math.sign(x || 1) * earOffset(u, t) * Math.abs(rawLateral);
            x *= 1 + (1 - bio.skew) * 0.12 * (x > 0 ? 1 : -1);
        }

        ring.push([x, y, z]);
    }

    return ring;
}

function pushSurface(vertices, quads, rings, segments) {
    const base = vertices.length;
    for (const ring of rings) vertices.push(...ring);

    for (let r = 0; r < rings.length - 1; r += 1) {
        for (let s = 0; s < segments; s += 1) {
            const next = (s + 1) % segments;
            quads.push([
                base + r * segments + s,
                base + (r + 1) * segments + s,
                base + (r + 1) * segments + next,
                base + r * segments + next
            ]);
        }
    }
    return base;
}

function pushPedestal(vertices, quads) {
    const levels = [
        [39, 28, BUST_BOTTOM_Y],
        [39, 28, BUST_BOTTOM_Y - 15],
        [52, 37, BUST_BOTTOM_Y - 18],
        [52, 37, BUST_BOTTOM_Y - 32]
    ];
    const base = vertices.length;

    for (const [halfWidth, halfDepth, y] of levels) {
        vertices.push(
            [-halfWidth, y, halfDepth],
            [halfWidth, y, halfDepth],
            [halfWidth, y, -halfDepth],
            [-halfWidth, y, -halfDepth]
        );
    }

    for (let level = 0; level < levels.length - 1; level += 1) {
        for (let corner = 0; corner < 4; corner += 1) {
            const next = (corner + 1) % 4;
            quads.push([
                base + level * 4 + corner,
                base + (level + 1) * 4 + corner,
                base + (level + 1) * 4 + next,
                base + level * 4 + next
            ]);
        }
    }
    const bottom = base + (levels.length - 1) * 4;
    quads.push([bottom, bottom + 1, bottom + 2, bottom + 3]);
}

export function buildBustMesh(params = {}, detail = 'high') {
    const segments = detail === 'low' ? 30 : 48;
    const headRings = detail === 'low' ? 28 : 42;
    const bodyRings = detail === 'low' ? 12 : 18;
    const bio = normaliseBiometrics(params);

    const vertices = [];
    const quads = [];

    const head = [];
    for (let r = 0; r <= headRings; r += 1) {
        head.push(buildRing(r / headRings, segments, bio, true));
    }
    pushSurface(vertices, quads, head, segments);

    const body = [];
    for (let r = 0; r <= bodyRings; r += 1) {
        body.push(buildRing(1 + (r / bodyRings) * 0.98, segments, bio, false));
    }
    pushSurface(vertices, quads, body, segments);

    const skirt = body[body.length - 1];
    const skirtBase = vertices.length;
    vertices.push(...skirt.map(([x, , z]) => [x * 0.96, BUST_BOTTOM_Y, z * 0.96]));
    for (let s = 0; s < segments; s += 1) {
        const next = (s + 1) % segments;
        quads.push([
            skirtBase - segments + s,
            skirtBase + s,
            skirtBase + next,
            skirtBase - segments + next
        ]);
    }

    pushPedestal(vertices, quads);

    return { vertices, quads, segments, headRings, bio };
}

export function meshFromLandmarks(mesh) {
    if (!Array.isArray(mesh) || mesh.length < 400) return null;
    return mesh.map(([x, y, z]) => [
        (x - 0.5) * 110,
        (0.5 - y) * 110,
        (0.5 - (z ?? 0)) * 110
    ]);
}
