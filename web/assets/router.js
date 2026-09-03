export function parseLocation() {
    const raw = location.hash.replace(/^#\/?/, '').trim();
    const segments = raw.split('/').map((entry) => decodeURIComponent(entry)).filter((entry) => entry.length > 0);

    return {
        name: segments[0] ?? '',
        params: segments.slice(1)
    };
}

export function pathOf(...segments) {
    const clean = segments
        .flat()
        .filter((entry) => entry !== null && entry !== undefined && String(entry).length > 0)
        .map((entry) => encodeURIComponent(String(entry)));

    return `#/${clean.join('/')}`;
}

export function go(...segments) {
    const target = pathOf(...segments);
    if (location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
    else location.hash = target;
}

export function back(...fallback) {
    if (history.length > 1) history.back();
    else go(...fallback);
}
