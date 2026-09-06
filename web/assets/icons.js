const SVG_NS = 'http://www.w3.org/2000/svg';

const PATHS = Object.freeze({
    gauge: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M14.1 9.9 17.5 6.5', 'M3 12a9 9 0 0 1 18 0'],
    camera: ['M3 7.5A1.5 1.5 0 0 1 4.5 6h9A1.5 1.5 0 0 1 15 7.5v9A1.5 1.5 0 0 1 13.5 18h-9A1.5 1.5 0 0 1 3 16.5v-9Z', 'm15 10.5 6-3.5v10l-6-3.5'],
    play: ['M6 4.5v15l13-7.5-13-7.5Z'],
    record: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z'],
    archive: ['M3 7h18v3H3z', 'M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9', 'M10 14h4'],
    timeline: ['M4 20V6', 'M4 12h6', 'M4 17h10', 'M4 7h14', 'M20 4v16'],
    alarm: ['M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z', 'M13.7 20a2 2 0 0 1-3.4 0'],
    shield: ['M12 3 4.5 6v6c0 4.5 3.2 7.9 7.5 9 4.3-1.1 7.5-4.5 7.5-9V6L12 3Z', 'm9.2 12 2 2 3.6-3.8'],
    settings: ['M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z', 'M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.2a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.1 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.3 7.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z'],
    users: ['M16 20v-1.8a3.6 3.6 0 0 0-3.6-3.6H6.6A3.6 3.6 0 0 0 3 18.2V20', 'M9.5 11.4a3.7 3.7 0 1 0 0-7.4 3.7 3.7 0 0 0 0 7.4Z', 'M21 20v-1.8a3.6 3.6 0 0 0-2.7-3.5', 'M15.5 4.1a3.6 3.6 0 0 1 0 7'],
    cpu: ['M6 6h12v12H6z', 'M9.5 9.5h5v5h-5z', 'M9 3v3', 'M15 3v3', 'M9 18v3', 'M15 18v3', 'M3 9h3', 'M3 15h3', 'M18 9h3', 'M18 15h3'],
    memory: ['M4 8h16v8H4z', 'M7 16v3', 'M12 16v3', 'M17 16v3', 'M8 11h8'],
    disk: ['M22 12H2', 'M5.5 5h13l3.5 7v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5l3.5-7Z', 'M6 16h.01', 'M10 16h.01'],
    network: ['M12 20v-4', 'M8 20h8', 'M5 4h14v8H5z', 'M9 16h6v4H9z'],
    activity: ['M22 12h-4l-3 8-6-16-3 8H2'],
    globe: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M3 12h18', 'M12 3a14 14 0 0 1 0 18', 'M12 3a14 14 0 0 0 0 18'],
    monitor: ['M3 5h18v11H3z', 'M9 20h6', 'M12 16v4'],
    clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l3 2'],
    check: ['m5 13 4 4L19 7'],
    close: ['M6 6 18 18', 'M18 6 6 18'],
    warning: ['M12 3 2 20h20L12 3Z', 'M12 10v4', 'M12 17h.01'],
    info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 11v5', 'M12 8h.01'],
    chevronRight: ['m9 5 7 7-7 7'],
    chevronLeft: ['m15 5-7 7 7 7'],
    plus: ['M12 5v14', 'M5 12h14'],
    trash: ['M4 7h16', 'M9 7V5h6v2', 'M6 7l1 13h10l1-13', 'M10 11v5', 'M14 11v5'],
    edit: ['M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z', 'M14.5 6.5 17.5 9.5'],
    search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.3-4.3'],
    refresh: ['M21 12a9 9 0 1 1-2.6-6.4', 'M21 4v5h-5'],
    download: ['M12 4v11', 'm7.5 11 4.5 4.5 4.5-4.5', 'M4 20h16'],
    power: ['M12 3v9', 'M6.5 6.5a8 8 0 1 0 11 0'],
    sun: ['M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z', 'M12 2v2', 'M12 20v2', 'm4.9 4.9 1.4 1.4', 'm17.7 17.7 1.4 1.4', 'M2 12h2', 'M20 12h2', 'm4.9 19.1 1.4-1.4', 'm17.7 6.3 1.4-1.4'],
    moon: ['M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z'],
    menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
    logout: ['M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', 'm10 16 4-4-4-4', 'M14 12H3'],
    lock: ['M6 11h12v9H6z', 'M9 11V8a3 3 0 0 1 6 0v3'],
    eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
    zap: ['M13 2 4 14h7l-1 8 9-12h-7l1-8Z'],
    server: ['M4 4h16v6H4z', 'M4 14h16v6H4z', 'M8 7h.01', 'M8 17h.01'],
    crop: ['M6 3v12a2 2 0 0 0 2 2h12', 'M3 6h12a2 2 0 0 1 2 2v12'],
    grid: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
    apps: ['M4 4h4v4H4z', 'M10 4h4v4h-4z', 'M16 4h4v4h-4z', 'M4 10h4v4H4z', 'M10 10h4v4h-4z', 'M16 10h4v4h-4z', 'M4 16h4v4H4z', 'M10 16h4v4h-4z', 'M16 16h4v4h-4z'],
    sparkles: ['M12 3 13.8 8.2 19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z', 'M18.5 15.5 19.4 18l2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.5Z'],
    minus: ['M5 12h14'],
    home: ['m3 11 9-7 9 7', 'M6 10v10h12V10', 'M10 20v-6h4v6'],
    arrowUp: ['M12 20V5', 'm6 11 6-6 6 6'],
    arrowDown: ['M12 4v15', 'm18 13-6 6-6-6'],
    arrowLeft: ['M20 12H5', 'm11 6-6 6 6 6'],
    arrowRight: ['M4 12h15', 'm13 6 6 6-6 6'],
    arrowUpLeft: ['M18 18 6 6', 'M6 14V6h8'],
    arrowUpRight: ['M6 18 18 6', 'M10 6h8v8'],
    arrowDownLeft: ['M18 6 6 18', 'M14 18H6v-8'],
    arrowDownRight: ['M6 6 18 18', 'M18 10v8h-8'],
    move: ['M12 3v18', 'M3 12h18', 'm9 6 3-3 3 3', 'm9 18 3 3 3-3', 'm6 9-3 3 3 3', 'm18 9 3 3-3 3'],
    mic: ['M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z', 'M5 11a7 7 0 0 0 14 0', 'M12 18v3', 'M9 21h6'],
    micOff: ['M2 2 22 22', 'M15 9V6a3 3 0 0 0-5.9-.7', 'M9 12v.5a3 3 0 0 0 4.5 2.6', 'M5 11a7 7 0 0 0 10.3 6.2', 'M19 11v1', 'M12 18v3', 'M9 21h6'],
    speaker: ['M4 9h3l5-4v14l-5-4H4V9Z', 'M16 9a4 4 0 0 1 0 6', 'M19 6a8 8 0 0 1 0 12'],
    speakerOff: ['M4 9h3l5-4v14l-5-4H4V9Z', 'M17 10l4 4', 'M21 10l-4 4'],
    image: ['M4 5h16v14H4z', 'M9 11a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 9 11Z', 'm5 17 4.5-4.5L13 16l3-2.5 3 3.5'],
    calendar: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4', 'M9 14h2', 'M13 14h2', 'M9 17h2'],
    bookmark: ['M7 4h10v16l-5-3.5L7 20V4Z'],
    tag: ['M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z', 'M8 8h.01'],
    filter: ['M3 5h18', 'M6 12h12', 'M10 19h4'],
    pin: ['M12 21s6-5.7 6-10a6 6 0 0 0-12 0c0 4.3 6 10 6 10Z', 'M12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'],
    note: ['M5 4h11l4 4v12H5z', 'M15 4v5h5', 'M9 13h7', 'M9 16h5']
});

export function icon(name, options = {}) {
    const paths = PATHS[name];
    if (!paths) return document.createComment(`icon:${name}`);

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', String(options.weight ?? 1.7));
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('icon');
    if (options.className) svg.classList.add(...options.className.split(' '));

    for (const definition of paths) {
        const node = document.createElementNS(SVG_NS, 'path');
        node.setAttribute('d', definition);
        svg.append(node);
    }

    return svg;
}

export function hasIcon(name) {
    return Object.prototype.hasOwnProperty.call(PATHS, name);
}
