const SVG_NS = 'http://www.w3.org/2000/svg';

export function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);

    for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined) continue;
        if (key.startsWith('on') && typeof value === 'function') {
            node.addEventListener(key.slice(2), value);
            continue;
        }
        if (key === 'className' || key === 'id' || key === 'type' || key === 'value' || key === 'checked') {
            node[key] = value;
            continue;
        }
        if (key === 'textContent') {
            node.textContent = value;
            continue;
        }
        node.setAttribute(key, value);
    }

    for (const child of [].concat(children)) {
        if (child === null || child === undefined) continue;
        node.append(child);
    }

    return node;
}

export function chip(text, variant) {
    return el('span', { className: variant ? `chip chip--${variant}` : 'chip', textContent: text });
}

export function field(label, input) {
    return el('div', { className: 'field' }, [el('label', { textContent: label }), input]);
}

export function notice(kind, text) {
    return el('div', { className: `notice notice--${kind}`, textContent: text });
}

export function empty(text) {
    return el('div', { className: 'empty', textContent: text });
}

export function brandMark() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 32 32');
    svg.setAttribute('aria-hidden', 'true');

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('width', '32');
    rect.setAttribute('height', '32');
    rect.setAttribute('rx', '7');
    rect.setAttribute('fill', '#0f6fa8');

    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('cx', '16');
    ring.setAttribute('cy', '16');
    ring.setAttribute('r', '7.5');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', '#ffffff');
    ring.setAttribute('stroke-width', '2.4');

    const pupil = document.createElementNS(SVG_NS, 'circle');
    pupil.setAttribute('cx', '16');
    pupil.setAttribute('cy', '16');
    pupil.setAttribute('r', '2.6');
    pupil.setAttribute('fill', '#ffffff');

    svg.append(rect, ring, pupil);
    return svg;
}

export function formatBytes(bytes) {
    if (typeof bytes !== 'number' || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDuration(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}g ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}
