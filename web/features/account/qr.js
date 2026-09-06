const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x;
    EXP[i + 255] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
}

function gmul(a, b) {
    return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

function rsPoly(n) {
    let p = [1];
    for (let i = 0; i < n; i++) {
        const next = new Array(p.length + 1).fill(0);
        const root = EXP[i];
        for (let j = 0; j < p.length; j++) {
            next[j] ^= p[j];
            next[j + 1] ^= gmul(p[j], root);
        }
        p = next;
    }
    return p;
}

function rsCalc(data, ecLen) {
    const gen = rsPoly(ecLen);
    const res = new Uint8Array(data.length + ecLen);
    res.set(data);
    for (let i = 0; i < data.length; i++) {
        const coef = res[i];
        if (coef !== 0) {
            for (let j = 0; j < gen.length; j++) {
                res[i + j] ^= gmul(gen[j], coef);
            }
        }
    }
    return res.subarray(data.length);
}

const SPECS = [
    null,
    { v: 1, size: 21, dataCap: 19, ecLen: 7, blocks: [{ data: 19, ec: 7 }], align: [] },
    { v: 2, size: 25, dataCap: 34, ecLen: 10, blocks: [{ data: 34, ec: 10 }], align: [6, 18] },
    { v: 3, size: 29, dataCap: 55, ecLen: 15, blocks: [{ data: 55, ec: 15 }], align: [6, 22] },
    { v: 4, size: 33, dataCap: 80, ecLen: 20, blocks: [{ data: 80, ec: 20 }], align: [6, 26] },
    { v: 5, size: 37, dataCap: 108, ecLen: 26, blocks: [{ data: 108, ec: 26 }], align: [6, 30] },
    { v: 6, size: 41, dataCap: 136, ecLen: 18, blocks: [{ data: 68, ec: 18 }, { data: 68, ec: 18 }], align: [6, 34] },
    { v: 7, size: 45, dataCap: 156, ecLen: 20, blocks: [{ data: 78, ec: 20 }, { data: 78, ec: 20 }], align: [6, 22, 38] },
    { v: 8, size: 49, dataCap: 194, ecLen: 24, blocks: [{ data: 97, ec: 24 }, { data: 97, ec: 24 }], align: [6, 24, 42] }
];

function chooseSpec(byteLen) {
    for (let v = 1; v < SPECS.length; v++) {
        const spec = SPECS[v];
        if (byteLen + 3 <= spec.dataCap) return spec;
    }
    return SPECS[8];
}

function encodeData(text, spec) {
    const bytes = typeof TextEncoder !== 'undefined'
        ? new TextEncoder().encode(text)
        : Buffer.from(text, 'utf8');

    let bits = '0100';
    bits += bytes.length.toString(2).padStart(8, '0');
    for (let i = 0; i < bytes.length; i++) {
        bits += bytes[i].toString(2).padStart(8, '0');
    }

    const totalDataBits = spec.dataCap * 8;
    const termLen = Math.min(4, totalDataBits - bits.length);
    if (termLen > 0) bits += '0'.repeat(termLen);

    while (bits.length % 8 !== 0) bits += '0';

    const padBytes = [0xec, 0x11];
    let padIdx = 0;
    while (bits.length < totalDataBits) {
        bits += padBytes[padIdx].toString(2).padStart(8, '0');
        padIdx ^= 1;
    }

    const dataCodewords = new Uint8Array(spec.dataCap);
    for (let i = 0; i < spec.dataCap; i++) {
        dataCodewords[i] = Number.parseInt(bits.slice(i * 8, (i + 1) * 8), 2);
    }

    const blockData = [];
    const blockEc = [];
    let offset = 0;
    for (const b of spec.blocks) {
        const d = dataCodewords.subarray(offset, offset + b.data);
        offset += b.data;
        blockData.push(d);
        blockEc.push(rsCalc(d, b.ec));
    }

    const finalBytes = [];
    const maxDataBlockLen = Math.max(...spec.blocks.map((b) => b.data));
    for (let i = 0; i < maxDataBlockLen; i++) {
        for (const bd of blockData) {
            if (i < bd.length) finalBytes.push(bd[i]);
        }
    }

    const ecLen = spec.blocks[0].ec;
    for (let i = 0; i < ecLen; i++) {
        for (const bec of blockEc) {
            if (i < bec.length) finalBytes.push(bec[i]);
        }
    }

    return finalBytes;
}

function isFinderZone(r, c, size) {
    if (r <= 8 && c <= 8) return true;
    if (r <= 8 && c >= size - 9) return true;
    if (r >= size - 9 && c <= 8) return true;
    return false;
}

function createMatrix(spec) {
    const size = spec.size;
    const grid = Array.from({ length: size }, () => new Int8Array(size).fill(-1));

    function setFinder(r0, c0) {
        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                const isBlack = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
                grid[r0 + r][c0 + c] = isBlack ? 1 : 0;
            }
        }
    }

    setFinder(0, 0);
    setFinder(0, size - 7);
    setFinder(size - 7, 0);

    for (let i = 0; i < 8; i++) {
        grid[7][i] = 0;
        grid[i][7] = 0;
        grid[7][size - 1 - i] = 0;
        grid[i][size - 8] = 0;
        grid[size - 8][i] = 0;
        grid[size - 1 - i][7] = 0;
    }

    for (let i = 8; i < size - 8; i++) {
        const bit = i % 2 === 0 ? 1 : 0;
        grid[6][i] = bit;
        grid[i][6] = bit;
    }

    const coords = spec.align;
    for (const r of coords) {
        for (const c of coords) {
            if (isFinderZone(r, c, size)) continue;
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    const isBlack = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
                    grid[r + dr][c + dc] = isBlack ? 1 : 0;
                }
            }
        }
    }

    grid[size - 8][8] = 1;

    if (spec.v >= 7) {
        const v = spec.v;
        let d = v << 12;
        const g = 0x1f25;
        for (let i = 17; i >= 12; i--) {
            if ((d >> i) & 1) d ^= (g << (i - 12));
        }
        const vbits = (v << 12) | d;
        for (let i = 0; i < 18; i++) {
            const bit = (vbits >> i) & 1;
            grid[size - 11 + (i % 3)][Math.floor(i / 3)] = bit;
            grid[Math.floor(i / 3)][size - 11 + (i % 3)] = bit;
        }
    }

    for (let i = 0; i < 9; i++) {
        if (grid[8][i] === -1) grid[8][i] = 0;
        if (grid[i][8] === -1) grid[i][8] = 0;
    }
    for (let i = 0; i < 8; i++) {
        if (grid[8][size - 1 - i] === -1) grid[8][size - 1 - i] = 0;
        if (grid[size - 1 - i][8] === -1) grid[size - 1 - i][8] = 0;
    }

    return grid;
}

const FORMAT_COORDS_1 = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
];

function applyFormat(grid, size, mask = 0) {
    const FORMAT_INFO = [
        0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976
    ];
    const bits = FORMAT_INFO[mask];
    const formatCoords2 = [
        [8, size - 1], [8, size - 2], [8, size - 3], [8, size - 4],
        [8, size - 5], [8, size - 6], [8, size - 7], [8, size - 8],
        [size - 7, 8], [size - 6, 8], [size - 5, 8], [size - 4, 8],
        [size - 3, 8], [size - 2, 8], [size - 1, 8]
    ];

    for (let i = 0; i < 15; i++) {
        const bit = (bits >> (14 - i)) & 1;
        const [r1, c1] = FORMAT_COORDS_1[i];
        const [r2, c2] = formatCoords2[i];
        grid[r1][c1] = bit;
        grid[r2][c2] = bit;
    }
}

function placeData(grid, spec, dataBytes, mask = 0) {
    const size = spec.size;
    let bitIdx = 0;
    const totalBits = dataBytes.length * 8;

    function getBit(idx) {
        if (idx >= totalBits) return 0;
        const b = dataBytes[idx >> 3];
        return (b >> (7 - (idx & 7))) & 1;
    }

    let upward = true;
    for (let c = size - 1; c > 0; c -= 2) {
        if (c === 6) c--;
        for (let step = 0; step < size; step++) {
            const r = upward ? size - 1 - step : step;
            for (let col = c; col >= c - 1; col--) {
                if (grid[r][col] !== -1) continue;
                let bit = getBit(bitIdx++);
                if ((r + col) % 2 === 0) bit ^= 1;
                grid[r][col] = bit;
            }
        }
        upward = !upward;
    }
}

export function generateQrMatrix(text) {
    const spec = chooseSpec(typeof text === 'string' ? text.length : 0);
    const dataBytes = encodeData(text, spec);
    const grid = createMatrix(spec);
    applyFormat(grid, spec.size, 0);
    placeData(grid, spec, dataBytes, 0);
    return grid;
}

export function renderQrSvg(text, options = {}) {
    const matrix = generateQrMatrix(text);
    const size = matrix.length;
    const margin = options.margin ?? 4;
    const totalSize = size + margin * 2;
    const displaySize = options.size ?? 180;

    let pathD = '';
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (matrix[r][c] === 1) {
                const x = c + margin;
                const y = r + margin;
                pathD += `M${x},${y}h1v1h-1z `;
            }
        }
    }

    if (typeof document === 'undefined') {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${displaySize}" height="${displaySize}" class="${options.className ?? 'qr-code'}"><rect width="${totalSize}" height="${totalSize}" fill="#ffffff"/><path d="${pathD.trim()}" fill="#000000"/></svg>`;
    }

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${totalSize} ${totalSize}`);
    svg.setAttribute('width', String(displaySize));
    svg.setAttribute('height', String(displaySize));
    svg.setAttribute('class', options.className ?? 'qr-code');

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', String(totalSize));
    bg.setAttribute('height', String(totalSize));
    bg.setAttribute('fill', '#ffffff');
    svg.append(bg);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD.trim());
    path.setAttribute('fill', '#000000');
    svg.append(path);

    return svg;
}
