import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFaceSurface } from '../web/features/people/face_mesh_surface.js';

function dome(count = 478, depthSign = 1) {
    const golden = Math.PI * (3 - Math.sqrt(5));
    const points = [];
    for (let i = 0; i < count; i += 1) {
        const radius = Math.sqrt((i + 0.5) / count) * 0.45;
        const angle = i * golden;
        const x = 0.5 + radius * Math.cos(angle);
        const y = 0.5 + radius * Math.sin(angle) * 1.2;
        const bulge = (0.45 - radius) * 0.4;
        points.push([x, y, depthSign * bulge]);
    }
    return points;
}

function interiorMinusBoundaryDepth(vertices) {
    const midX = vertices.reduce((total, point) => total + point[0], 0) / vertices.length;
    const midY = vertices.reduce((total, point) => total + point[1], 0) / vertices.length;
    const radii = vertices.map(([x, y]) => Math.hypot(x - midX, y - midY));
    const sorted = [...radii].sort((left, right) => left - right);
    const inner = sorted[Math.floor(sorted.length * 0.25)];
    const outer = sorted[Math.floor(sorted.length * 0.85)];

    let innerSum = 0;
    let innerCount = 0;
    let outerSum = 0;
    let outerCount = 0;
    vertices.forEach((point, index) => {
        if (radii[index] <= inner) {
            innerSum += point[2];
            innerCount += 1;
        } else if (radii[index] >= outer) {
            outerSum += point[2];
            outerCount += 1;
        }
    });
    return innerSum / innerCount - outerSum / outerCount;
}

test('una mesh troppo corta non produce superficie', () => {
    assert.equal(buildFaceSurface(null), null);
    assert.equal(buildFaceSurface([[0, 0, 0], [1, 1, 1]]), null);
    assert.equal(buildFaceSurface(dome(120)), null);
});

test('la superficie triangola i punti densi con indici validi', () => {
    const surface = buildFaceSurface(dome());

    assert.ok(surface.triangles.length > 500, `pochi triangoli: ${surface.triangles.length}`);
    assert.equal(surface.vertices.length, 468);
    for (const triangle of surface.triangles) {
        assert.equal(triangle.length, 3);
        for (const index of triangle) {
            assert.ok(Number.isInteger(index) && index >= 0 && index < surface.vertices.length);
        }
        assert.equal(new Set(triangle).size, 3);
    }
});

test('la superficie viene inserita nel volume della testa', () => {
    const surface = buildFaceSurface(dome());
    for (const [x, y] of surface.vertices) {
        assert.ok(Math.abs(x) <= 32, `x fuori scala: ${x}`);
        assert.ok(Math.abs(y - 4) <= 43, `y fuori scala: ${y}`);
    }
});

test('il rilievo punta in avanti qualunque sia il segno della profondita', () => {
    for (const sign of [1, -1]) {
        const surface = buildFaceSurface(dome(478, sign));
        assert.ok(
            interiorMinusBoundaryDepth(surface.vertices) > 0,
            `con segno ${sign} il volto risulta concavo`
        );
    }
});

test('la confidenza per vertice viene riportata e limitata a 0..1', () => {
    const mesh = dome();
    const confidence = mesh.map((point, index) => (index % 3 === 0 ? 2.5 : -1));
    const surface = buildFaceSurface(mesh, confidence);

    assert.equal(surface.confidence.length, surface.vertices.length);
    for (const value of surface.confidence) {
        assert.ok(value >= 0 && value <= 1);
    }
    assert.equal(surface.confidence[0], 1);
    assert.equal(surface.confidence[1], 0);
});
