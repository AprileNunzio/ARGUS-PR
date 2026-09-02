export function normalisePlate(text) {
    return String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const ITALIAN_PLATE_PATTERN = /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/;
const GENERIC_EU_PATTERN = /^[A-Z0-9]{4,10}$/;

export function isValidPlateFormat(plate, { strictItalian = false } = {}) {
    const norm = normalisePlate(plate);
    if (strictItalian) {
        return ITALIAN_PLATE_PATTERN.test(norm);
    }
    return ITALIAN_PLATE_PATTERN.test(norm) || GENERIC_EU_PATTERN.test(norm);
}

export function voteOnPlate(readings = [], minVotes = 3) {
    if (!Array.isArray(readings) || readings.length === 0) return null;

    const scores = new Map();
    const counts = new Map();

    for (const r of readings) {
        const text = normalisePlate(r.text);
        if (!text) continue;
        const conf = typeof r.confidence === 'number' ? Math.max(0, Math.min(1, r.confidence)) : 0.5;
        scores.set(text, (scores.get(text) ?? 0) + conf);
        counts.set(text, (counts.get(text) ?? 0) + 1);
    }

    let best = null;
    for (const [text, score] of scores.entries()) {
        const count = counts.get(text);
        if (!best || score > best.score) {
            best = { text, score, count };
        }
    }

    if (!best || readings.length < minVotes) return null;

    return {
        text: best.text,
        confidence: Number((best.score / best.count).toFixed(3)),
        samples: readings.length,
        isFormatValid: isValidPlateFormat(best.text)
    };
}
