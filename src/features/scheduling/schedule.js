export const TOTAL_SLOTS = 336;
export const DEFAULT_WEEK_MASK = '1'.repeat(TOTAL_SLOTS);

export function slotIndex(date) {
    const day = date.getDay();
    const slot = date.getHours() * 2 + (date.getMinutes() >= 30 ? 1 : 0);
    return day * 48 + slot;
}

export function isActive(schedule, exception, date = new Date()) {
    if (!schedule && !exception) return true;

    const effective = exception ?? schedule;
    const mode = effective.mode ?? 'continuous';

    if (mode === 'continuous') return true;
    if (mode === 'off' || mode === 'motion') return false;
    if (mode !== 'scheduled') return false;

    const mask = effective.weekMask ?? schedule?.weekMask ?? DEFAULT_WEEK_MASK;
    if (typeof mask !== 'string' || mask.length < TOTAL_SLOTS) return false;

    const index = slotIndex(date);
    return mask[index] === '1';
}
