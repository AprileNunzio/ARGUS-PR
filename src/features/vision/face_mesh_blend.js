const MIN_POINTS = 400;
const MAX_MESH_WEIGHT = 60;
const OUTLIER_FACTOR = 3.2;
const REJECT_MEDIAN = 0.28;
const POWER_ITERATIONS = 64;

function centroidOf(points) {
    const sum = [0, 0, 0];
    for (const point of points) {
        sum[0] += point[0];
        sum[1] += point[1];
        sum[2] += point[2];
    }
    return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
}

export function normaliseMesh(points) {
    const centre = centroidOf(points);
    let squared = 0;
    const centred = points.map(([x, y, z]) => {
        const dx = x - centre[0];
        const dy = y - centre[1];
        const dz = (z ?? 0) - centre[2];
        squared += dx * dx + dy * dy + dz * dz;
        return [dx, dy, dz];
    });
    const scale = Math.sqrt(squared / points.length) || 1;
    return centred.map(([x, y, z]) => [x / scale, y / scale, z / scale]);
}

function crossSums(source, target) {
    const sums = new Float64Array(9);
    for (let i = 0; i < source.length; i += 1) {
        const p = source[i];
        const q = target[i];
        for (let a = 0; a < 3; a += 1) {
            for (let b = 0; b < 3; b += 1) {
                sums[a * 3 + b] += p[a] * q[b];
            }
        }
    }
    return sums;
}

function quaternionMatrix(s) {
    const xx = s[0];
    const xy = s[1];
    const xz = s[2];
    const yx = s[3];
    const yy = s[4];
    const yz = s[5];
    const zx = s[6];
    const zy = s[7];
    const zz = s[8];
    return [
        [xx + yy + zz, yz - zy, zx - xz, xy - yx],
        [yz - zy, xx - yy - zz, xy + yx, zx + xz],
        [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
        [xy - yx, zx + xz, yz + zy, -xx - yy + zz]
    ];
}

function dominantEigenvector(matrix) {
    let shift = 0;
    for (const row of matrix) {
        let absolute = 0;
        for (const value of row) absolute += Math.abs(value);
        shift = Math.max(shift, absolute);
    }

    let vector = [1, 0, 0, 0];
    for (let step = 0; step < POWER_ITERATIONS; step += 1) {
        const next = [0, 0, 0, 0];
        for (let r = 0; r < 4; r += 1) {
            let total = shift * vector[r];
            for (let c = 0; c < 4; c += 1) total += matrix[r][c] * vector[c];
            next[r] = total;
        }
        const length = Math.hypot(next[0], next[1], next[2], next[3]) || 1;
        vector = [next[0] / length, next[1] / length, next[2] / length, next[3] / length];
    }
    return vector;
}

function rotationFromQuaternion(quaternion) {
    const [w, x, y, z] = quaternion;
    return [
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]
    ];
}

function applyRotation(points, rotation) {
    return points.map(([x, y, z]) => [
        rotation[0][0] * x + rotation[0][1] * y + rotation[0][2] * z,
        rotation[1][0] * x + rotation[1][1] * y + rotation[1][2] * z,
        rotation[2][0] * x + rotation[2][1] * y + rotation[2][2] * z
    ]);
}

export function alignMesh(source, target) {
    const moving = normaliseMesh(source);
    const reference = normaliseMesh(target);
    const rotation = rotationFromQuaternion(dominantEigenvector(quaternionMatrix(crossSums(moving, reference))));
    return applyRotation(moving, rotation);
}

function medianOf(values) {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function round4(point) {
    return [Number(point[0].toFixed(4)), Number(point[1].toFixed(4)), Number(point[2].toFixed(4))];
}

function firstObservation(points, weight) {
    const normalised = normaliseMesh(points);
    return {
        mesh: normalised.map(round4),
        meshConfidence: normalised.map(() => 1),
        meshObservations: Number(weight.toFixed(3))
    };
}

export function blendFaceMesh(current = {}, incoming = null, weight = 0) {
    if (!Array.isArray(incoming) || incoming.length < MIN_POINTS) return null;
    if (!(weight > 0)) return null;

    const previous = Array.isArray(current.mesh) ? current.mesh : null;
    const observed = Math.min(MAX_MESH_WEIGHT, Number(current.meshObservations) || 0);
    if (!previous || previous.length !== incoming.length || observed <= 0) {
        return firstObservation(incoming, weight);
    }

    const aligned = alignMesh(incoming, previous);
    const deviations = aligned.map((point, index) => Math.hypot(
        point[0] - previous[index][0],
        point[1] - previous[index][1],
        point[2] - previous[index][2]
    ));

    const median = medianOf(deviations);
    if (median > REJECT_MEDIAN) return null;

    const limit = Math.max(0.02, median * OUTLIER_FACTOR);
    const confidence = Array.isArray(current.meshConfidence) && current.meshConfidence.length === previous.length
        ? current.meshConfidence
        : previous.map(() => 1);

    const total = observed + weight;
    const mesh = [];
    const nextConfidence = [];

    for (let i = 0; i < previous.length; i += 1) {
        const accepted = deviations[i] <= limit;
        const settled = (Number(confidence[i]) || 0) * observed;
        const accumulated = settled + (accepted ? weight : 0);
        nextConfidence.push(Number((accumulated / total).toFixed(3)));

        if (!accepted || accumulated <= 0) {
            mesh.push(previous[i]);
            continue;
        }
        mesh.push(round4([
            (previous[i][0] * settled + aligned[i][0] * weight) / accumulated,
            (previous[i][1] * settled + aligned[i][1] * weight) / accumulated,
            (previous[i][2] * settled + aligned[i][2] * weight) / accumulated
        ]));
    }

    return {
        mesh,
        meshConfidence: nextConfidence,
        meshObservations: Number(total.toFixed(3))
    };
}
