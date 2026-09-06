export function pointInPolygon(x, y, points) {
    if (!points || points.length < 3) return false;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        const intersects = (yi > y) !== (yj > y)
            && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersects) inside = !inside;
    }
    return inside;
}

export function buildZoneMask(zones, width, height) {
    const totalPixels = width * height;
    const mask = new Uint32Array(totalPixels);
    const zoneCounts = new Uint32Array(Math.max(1, zones.length));

    for (let y = 0; y < height; y += 1) {
        const py = (y + 0.5) / height;
        const rowOffset = y * width;
        for (let x = 0; x < width; x += 1) {
            const px = (x + 0.5) / width;
            let bits = 0;

            for (let z = 0; z < zones.length; z += 1) {
                if (pointInPolygon(px, py, zones[z].points)) {
                    bits |= (1 << z);
                    zoneCounts[z] += 1;
                }
            }

            mask[rowOffset + x] = bits;
        }
    }

    return { mask, zoneCounts };
}
