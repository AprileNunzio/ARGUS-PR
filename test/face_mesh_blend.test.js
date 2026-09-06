import test from 'node:test';
import assert from 'node:assert/strict';
import { alignMesh, normaliseMesh, blendFaceMesh } from '../src/features/vision/face_mesh_blend.js';

function syntheticFace(count = 478, seed = 1) {
    let state = seed;
    const random = () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
    const points = [];
    for (let i = 0; i < count; i += 1) {
        const u = (i / count) * Math.PI * 2;
        points.push([
            0.5 + 0.18 * Math.cos(u) + random() * 0.02,
            0.5 + 0.24 * Math.sin(u) + random() * 0.02,
            0.05 * Math.cos(u * 3) + random() * 0.01
        ]);
    }
    return points;
}

function rotateY(points, degrees) {
    const angle = (degrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return points.map(([x, y, z]) => [x * cos + z * sin, y, -x * sin + z * cos]);
}

function maxDeviation(a, b) {
    let worst = 0;
    for (let i = 0; i < a.length; i += 1) {
        worst = Math.max(worst, Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1], a[i][2] - b[i][2]));
    }
    return worst;
}

test('alignMesh annulla una rotazione rigida nota', () => {
    const reference = syntheticFace();
    const rotated = rotateY(reference, 27);

    const before = maxDeviation(normaliseMesh(rotated), normaliseMesh(reference));
    const after = maxDeviation(alignMesh(rotated, reference), normaliseMesh(reference));

    assert.ok(before > 0.2, `atteso disallineamento iniziale, ottenuto ${before}`);
    assert.ok(after < 1e-3, `atteso allineamento sotto 1e-3, ottenuto ${after}`);
});

test('alignMesh e invariante a traslazione e scala', () => {
    const reference = syntheticFace();
    const moved = reference.map(([x, y, z]) => [x * 2.4 + 11, y * 2.4 - 7, z * 2.4 + 3]);

    assert.ok(maxDeviation(alignMesh(moved, reference), normaliseMesh(reference)) < 1e-3);
});

test('blendFaceMesh accumula osservazioni invece di sovrascrivere', () => {
    const reference = syntheticFace();
    const first = blendFaceMesh({}, reference, 1);

    assert.equal(first.meshObservations, 1);
    assert.equal(first.mesh.length, reference.length);

    const second = blendFaceMesh(first, rotateY(reference, 18), 1);
    assert.equal(second.meshObservations, 2);
    assert.ok(maxDeviation(second.mesh, first.mesh) < 5e-3);
});

test('blendFaceMesh scarta un campione incoerente', () => {
    const reference = syntheticFace();
    const first = blendFaceMesh({}, reference, 1);
    const noise = syntheticFace(478, 99).map(([x, y, z]) => [x * 3, y * 0.2, z + 0.9]);

    assert.equal(blendFaceMesh(first, noise, 1), null);
});

test('blendFaceMesh isola i vertici anomali abbassandone la confidenza', () => {
    const reference = syntheticFace();
    const first = blendFaceMesh({}, reference, 1);

    const damaged = reference.map((point, index) => (
        index === 10 ? [point[0] + 0.4, point[1] + 0.4, point[2]] : point
    ));
    const second = blendFaceMesh(first, damaged, 1);

    assert.ok(second.meshConfidence[10] < 0.6);
    assert.ok(second.meshConfidence[200] > 0.9);
    assert.ok(maxDeviation([second.mesh[10]], [first.mesh[10]]) < 1e-6);
});

test('blendFaceMesh rifiuta mesh corte o peso nullo', () => {
    assert.equal(blendFaceMesh({}, [[0, 0, 0]], 1), null);
    assert.equal(blendFaceMesh({}, syntheticFace(), 0), null);
});
