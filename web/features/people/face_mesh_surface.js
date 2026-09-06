const MIN_POINTS = 400;
const SURFACE_POINTS = 468;
const EDGE_LIMIT_FACTOR = 2.4;

function toModelSpace(mesh) {
    return mesh.slice(0, SURFACE_POINTS).map(([x, y, z]) => [x, -y, -(z ?? 0)]);
}

function circumcircle(a, b, c) {
    const ax = a[0];
    const ay = a[1];
    const bx = b[0];
    const by = b[1];
    const cx = c[0];
    const cy = c[1];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-12) return null;

    const a2 = ax * ax + ay * ay;
    const b2 = bx * bx + by * by;
    const c2 = cx * cx + cy * cy;
    const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
    const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    const dx = ax - ux;
    const dy = ay - uy;
    return { x: ux, y: uy, r2: dx * dx + dy * dy };
}

function boundingFrame(points) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of points) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const span = Math.max(spanX, spanY) * 12;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    return [
        [midX - span, midY - span],
        [midX + span, midY - span],
        [midX, midY + span]
    ];
}

function triangulate(points) {
    const working = [...points, ...boundingFrame(points)];
    const anchor = points.length;
    let cells = [{ indices: [anchor, anchor + 1, anchor + 2], circle: circumcircle(working[anchor], working[anchor + 1], working[anchor + 2]) }];

    for (let p = 0; p < points.length; p += 1) {
        const point = working[p];
        const kept = [];
        const edges = [];

        for (const cell of cells) {
            const circle = cell.circle;
            const inside = circle !== null
                && (point[0] - circle.x) ** 2 + (point[1] - circle.y) ** 2 <= circle.r2;
            if (!inside) {
                kept.push(cell);
                continue;
            }
            const [i, j, k] = cell.indices;
            edges.push([i, j], [j, k], [k, i]);
        }

        cells = kept;
        for (let e = 0; e < edges.length; e += 1) {
            const [a, b] = edges[e];
            let shared = false;
            for (let o = 0; o < edges.length; o += 1) {
                if (o === e) continue;
                if ((edges[o][0] === a && edges[o][1] === b) || (edges[o][0] === b && edges[o][1] === a)) {
                    shared = true;
                    break;
                }
            }
            if (shared) continue;
            cells.push({ indices: [a, b, p], circle: circumcircle(working[a], working[b], point) });
        }
    }

    return cells
        .map((cell) => cell.indices)
        .filter((indices) => indices.every((index) => index < points.length));
}

function longestEdge(points, [i, j, k]) {
    const side = (a, b) => Math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1]);
    return Math.max(side(i, j), side(j, k), side(k, i));
}

function pruneStretched(points, triangles) {
    const lengths = triangles.map((triangle) => longestEdge(points, triangle));
    const sorted = [...lengths].sort((left, right) => left - right);
    const median = sorted[Math.floor(sorted.length / 2)] || 1;
    const limit = median * EDGE_LIMIT_FACTOR;
    return triangles.filter((triangle, index) => lengths[index] <= limit);
}

function orientOutward(points, triangles) {
    return triangles.map(([i, j, k]) => {
        const area = (points[j][0] - points[i][0]) * (points[k][1] - points[i][1])
            - (points[k][0] - points[i][0]) * (points[j][1] - points[i][1]);
        return area < 0 ? [i, k, j] : [i, j, k];
    });
}

function depthIsInverted(points) {
    const midX = points.reduce((total, point) => total + point[0], 0) / points.length;
    const midY = points.reduce((total, point) => total + point[1], 0) / points.length;
    const radii = points.map(([x, y]) => Math.hypot(x - midX, y - midY));
    const sorted = [...radii].sort((left, right) => left - right);
    const inner = sorted[Math.floor(sorted.length * 0.35)];
    const outer = sorted[Math.floor(sorted.length * 0.8)];

    let innerZ = 0;
    let innerCount = 0;
    let outerZ = 0;
    let outerCount = 0;
    points.forEach((point, index) => {
        if (radii[index] <= inner) {
            innerZ += point[2];
            innerCount += 1;
        } else if (radii[index] >= outer) {
            outerZ += point[2];
            outerCount += 1;
        }
    });

    if (innerCount === 0 || outerCount === 0) return false;
    return innerZ / innerCount < outerZ / outerCount;
}

function fitToHead(points, { width, height, offsetY, offsetZ }) {
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const zs = points.map((point) => point[2]);
    const spanX = Math.max(...xs) - Math.min(...xs) || 1;
    const spanY = Math.max(...ys) - Math.min(...ys) || 1;
    const midX = (Math.max(...xs) + Math.min(...xs)) / 2;
    const midY = (Math.max(...ys) + Math.min(...ys)) / 2;
    const midZ = (Math.max(...zs) + Math.min(...zs)) / 2;
    const scale = Math.min(width / spanX, height / spanY);

    return points.map(([x, y, z]) => [
        (x - midX) * scale,
        (y - midY) * scale + offsetY,
        offsetZ + (z - midZ) * scale
    ]);
}

export function buildFaceSurface(mesh, confidence = null, fit = {}) {
    if (!Array.isArray(mesh) || mesh.length < MIN_POINTS) return null;

    let points = toModelSpace(mesh);
    if (depthIsInverted(points)) points = points.map(([x, y, z]) => [x, y, -z]);

    const triangles = orientOutward(points, pruneStretched(points, triangulate(points)));
    if (triangles.length === 0) return null;

    const weights = Array.isArray(confidence) && confidence.length >= points.length
        ? confidence.slice(0, points.length).map((value) => Math.min(1, Math.max(0, Number(value) || 0)))
        : points.map(() => 1);

    return {
        vertices: fitToHead(points, {
            width: fit.width ?? 62,
            height: fit.height ?? 84,
            offsetY: fit.offsetY ?? 4,
            offsetZ: fit.offsetZ ?? 44
        }),
        triangles,
        confidence: weights
    };
}
