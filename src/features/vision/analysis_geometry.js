const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 360;
const WIDE_ASPECT = 2.2;
const WIDE_HEIGHT = 540;
const MIN_WIDTH = 256;
const MAX_PIXELS = 1920 * 540;

function even(value) {
    return Math.max(2, Math.round(value / 2) * 2);
}

export function analysisSizeFor(sourceWidth, sourceHeight) {
    const width = Number(sourceWidth);
    const height = Number(sourceHeight);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
    }

    const aspect = width / height;
    let targetHeight = aspect < WIDE_ASPECT ? DEFAULT_HEIGHT : WIDE_HEIGHT;
    let targetWidth = targetHeight * aspect;

    const pixels = targetWidth * targetHeight;
    if (pixels > MAX_PIXELS) {
        const factor = Math.sqrt(MAX_PIXELS / pixels);
        targetHeight *= factor;
        targetWidth *= factor;
    }

    if (targetWidth < MIN_WIDTH) {
        targetHeight *= MIN_WIDTH / targetWidth;
        targetWidth = MIN_WIDTH;
    }

    return { width: even(targetWidth), height: even(targetHeight) };
}

export function isWideSource(sourceWidth, sourceHeight) {
    const width = Number(sourceWidth);
    const height = Number(sourceHeight);
    return Number.isFinite(width) && Number.isFinite(height) && height > 0 && width / height >= WIDE_ASPECT;
}
