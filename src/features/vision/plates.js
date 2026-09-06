export function normalisePlate(text) {
    return String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const ITALIAN_PLATE_PATTERN = /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/;

export const PLATE_PATTERNS = Object.freeze([
    /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/,
    /^[A-Z]{1,3}[0-9]{2,4}[A-Z]{1,3}$/,
    /^[0-9]{1,4}[A-Z]{2,3}[0-9]{1,3}$/,
    /^[A-Z]{2,3}[0-9]{3,5}$/,
    /^[0-9]{3,5}[A-Z]{2,3}$/
]);

const MIN_LENGTH = 5;
const MAX_LENGTH = 9;

export function isValidPlateFormat(plate, { strictItalian = false } = {}) {
    const norm = normalisePlate(plate);
    if (strictItalian) return ITALIAN_PLATE_PATTERN.test(norm);
    if (norm.length < MIN_LENGTH || norm.length > MAX_LENGTH) return false;
    return PLATE_PATTERNS.some((pattern) => pattern.test(norm));
}

const TO_DIGIT = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6', T: '7', A: '4' };
const TO_LETTER = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 8: 'B', 6: 'G', 4: 'A' };
const ITALIAN_LETTERS = new Set('ABCDEFGHJKLMNPRSTVWXYZ');

const PLATE_SHAPES = Object.freeze([
    { id: 'italian', slots: 'LLDDDLL', letters: ITALIAN_LETTERS },
    { id: 'letters-digits-letters', slots: 'LLDDDLL', letters: null },
    { id: 'letters-digits', slots: 'LLLDDDD', letters: null },
    { id: 'digits-letters', slots: 'DDDDLLL', letters: null }
]);

function coerceSlot(character, wantDigit) {
    if (wantDigit) return /[0-9]/.test(character) ? character : (TO_DIGIT[character] ?? null);
    return /[A-Z]/.test(character) ? character : (TO_LETTER[character] ?? null);
}

function fitShape(norm, shape) {
    const length = shape.slots.length;
    let best = null;

    for (let start = 0; start + length <= norm.length; start += 1) {
        let candidate = '';
        let edits = 0;

        for (let index = 0; index < length; index += 1) {
            const wantDigit = shape.slots[index] === 'D';
            const source = norm[start + index];
            const coerced = coerceSlot(source, wantDigit);
            if (coerced === null || (!wantDigit && shape.letters && !shape.letters.has(coerced))) {
                candidate = '';
                break;
            }
            if (coerced !== source) edits += 1;
            candidate += coerced;
        }

        if (!candidate) continue;
        if (!best || edits < best.edits) best = { text: candidate, edits };
    }

    return best;
}

export function coercePlate(text, { format = 'auto' } = {}) {
    const norm = normalisePlate(text);
    if (!norm) return null;
    if (format === 'auto' && isValidPlateFormat(norm)) return norm;

    const shapes = format === 'auto'
        ? PLATE_SHAPES
        : PLATE_SHAPES.filter((shape) => shape.id === format);

    let best = null;
    for (const shape of shapes) {
        const fitted = fitShape(norm, shape);
        if (!fitted || !isValidPlateFormat(fitted.text)) continue;
        if (!best || fitted.edits < best.edits) best = fitted;
    }

    return best ? best.text : null;
}

export function coerceItalianPlate(text) {
    return coercePlate(text, { format: 'italian' });
}

export function voteOnPlate(readings = [], minVotes = 3, { format = 'auto' } = {}) {
    if (!Array.isArray(readings) || readings.length === 0) return null;

    const scores = new Map();
    const counts = new Map();

    for (const r of readings) {
        const text = coercePlate(r.text, { format });
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

    if (!best || best.count < minVotes) return null;
    if (!isValidPlateFormat(best.text)) return null;

    return {
        text: best.text,
        confidence: Number((best.score / best.count).toFixed(3)),
        samples: readings.length,
        isFormatValid: isValidPlateFormat(best.text)
    };
}
