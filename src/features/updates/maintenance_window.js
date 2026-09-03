const MINUTES_IN_DAY = 24 * 60;

function toMinutes(text) {
    const [hours, minutes] = String(text).split(':').map((part) => Number.parseInt(part, 10));
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
    return hours * 60 + minutes;
}

export function describeWindow(window) {
    const start = toMinutes(window.start);
    const end = toMinutes(window.end);
    if (start === null || end === null) return null;

    return {
        days: [...new Set(window.days ?? [])].filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
        start,
        end,
        crossesMidnight: end <= start
    };
}

export function insideWindow(now, window) {
    const parsed = describeWindow(window);
    if (!parsed || parsed.days.length === 0) return false;

    const minutes = now.getHours() * 60 + now.getMinutes();
    const today = now.getDay();
    const yesterday = (today + 6) % 7;

    if (!parsed.crossesMidnight) {
        return parsed.days.includes(today) && minutes >= parsed.start && minutes < parsed.end;
    }

    if (parsed.days.includes(today) && minutes >= parsed.start) return true;

    return parsed.days.includes(yesterday) && minutes < parsed.end;
}

export function nextOpening(now, window) {
    const parsed = describeWindow(window);
    if (!parsed || parsed.days.length === 0) return null;

    for (let offset = 0; offset <= 7; offset += 1) {
        const day = new Date(now.getTime());
        day.setDate(day.getDate() + offset);
        day.setHours(0, 0, 0, 0);

        if (!parsed.days.includes(day.getDay())) continue;

        const opening = new Date(day.getTime() + parsed.start * 60 * 1000);
        if (opening.getTime() > now.getTime()) return opening.toISOString();
    }

    return null;
}

export function windowMinutes() {
    return MINUTES_IN_DAY;
}
