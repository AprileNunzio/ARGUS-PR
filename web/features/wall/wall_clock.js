export const DEFAULT_CLOCK = Object.freeze({
    format: '24h',
    showSeconds: true,
    dateStyle: 'short',
    showTimezone: false
});

export const CLOCK_FORMAT_OPTIONS = Object.freeze([
    { value: '24h', label: '24 ore', hint: 'Formato europeo 13:45:07' },
    { value: '12h', label: '12 ore AM/PM', hint: 'Formato anglosassone 1:45:07 PM' }
]);

export const DATE_STYLE_OPTIONS = Object.freeze([
    { value: 'none', label: 'Nessuna data', hint: 'Solo orologio' },
    { value: 'short', label: 'Data breve', hint: 'mar 04/09/2026' },
    { value: 'long', label: 'Data estesa', hint: 'martedi 4 settembre 2026' }
]);

function normalise(clock) {
    const source = clock && typeof clock === 'object' ? clock : {};
    return {
        format: source.format === '12h' ? '12h' : '24h',
        showSeconds: source.showSeconds !== false,
        dateStyle: ['none', 'short', 'long'].includes(source.dateStyle) ? source.dateStyle : DEFAULT_CLOCK.dateStyle,
        showTimezone: source.showTimezone === true
    };
}

export function formatWallTime(date, clock, timeZone) {
    const settings = normalise(clock);

    const options = {
        hour: '2-digit',
        minute: '2-digit',
        hour12: settings.format === '12h'
    };

    if (settings.showSeconds) options.second = '2-digit';
    if (settings.showTimezone) options.timeZoneName = 'short';
    if (timeZone) options.timeZone = timeZone;

    return new Intl.DateTimeFormat('it-IT', options).format(date);
}

export function formatWallDate(date, clock, timeZone) {
    const settings = normalise(clock);
    if (settings.dateStyle === 'none') return '';

    const options = settings.dateStyle === 'long'
        ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
        : { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' };

    if (timeZone) options.timeZone = timeZone;

    return new Intl.DateTimeFormat('it-IT', options).format(date);
}

export function formatWallStamp(date, clock, timeZone) {
    const time = formatWallTime(date, clock, timeZone);
    const day = formatWallDate(date, clock, timeZone);
    return day.length > 0 ? `${day} · ${time}` : time;
}
