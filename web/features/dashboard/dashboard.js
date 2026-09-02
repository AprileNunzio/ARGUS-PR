import { el, chip, formatBytes, formatDuration, empty, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

const RADIUS = 36;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SVG_NS = 'http://www.w3.org/2000/svg';

function ring(percent, caption, color) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 88 88');

    const track = document.createElementNS(SVG_NS, 'circle');
    track.setAttribute('class', 'ring__track');
    track.setAttribute('cx', '44');
    track.setAttribute('cy', '44');
    track.setAttribute('r', String(RADIUS));

    const value = document.createElementNS(SVG_NS, 'circle');
    value.setAttribute('class', 'ring__value');
    value.setAttribute('cx', '44');
    value.setAttribute('cy', '44');
    value.setAttribute('r', String(RADIUS));
    value.setAttribute('stroke-dasharray', String(CIRCUMFERENCE));
    value.setAttribute('stroke-dashoffset', String(CIRCUMFERENCE * (1 - Math.min(percent, 100) / 100)));

    svg.append(track, value);

    const wrapper = el('div', { className: 'ring' }, [
        svg,
        el('div', { className: 'ring__label' }, [
            el('span', { className: 'ring__number', textContent: `${Math.round(percent)}%` }),
            el('span', { className: 'ring__caption', textContent: caption })
        ])
    ]);

    wrapper.style.setProperty('--ring-color', color);
    wrapper.style.setProperty('--ring-circumference', String(CIRCUMFERENCE));
    return wrapper;
}

function statCard(config, delay) {
    const card = el('div', { className: `stat rise rise-${delay}` }, [
        el('span', { className: 'stat__icon' }, [icon(config.icon, { className: 'icon--lg' })]),
        el('div', { className: 'stat__body' }, [
            el('span', { className: 'stat__value', textContent: config.value }),
            el('span', { className: 'stat__label', textContent: config.label }),
            config.hint ? el('span', { className: 'stat__hint', textContent: config.hint }) : null
        ])
    ]);
    card.style.setProperty('--stat-color', config.color);
    return card;
}

function heroBand(info) {
    return el('section', { className: 'hero rise' }, [
        el('div', { className: 'hero__body' }, [
            el('span', { className: 'hero__eyebrow', textContent: 'Centro di controllo' }),
            el('h1', { className: 'hero__title', textContent: info.hostname }),
            el('span', { className: 'hero__sub', textContent: `${info.platform} · Node ${info.node} · ARGUS-PR ${info.version}` })
        ]),
        el('div', { className: 'hero__side' }, [
            el('span', { className: 'hero__pill' }, [icon('camera'), el('span', { textContent: `${info.cameraCount} canali` })]),
            el('span', { className: 'hero__pill' }, [icon('activity'), el('span', { textContent: formatDuration(info.uptimeSeconds) })]),
            el('span', { className: 'hero__pill' }, [
                icon(info.media.available ? 'check' : 'warning'),
                el('span', { textContent: info.media.available ? 'Motore pronto' : 'Motore assente' })
            ])
        ])
    ]);
}

function mediaPanel(media) {
    const panel = el('section', { className: 'panel panel--accent rise rise-3' });
    panel.style.setProperty('--panel-accent', 'var(--grad-violet)');
    panel.style.setProperty('--panel-icon', 'var(--violet)');

    const head = el('div', { className: 'panel__head' }, [
        el('span', { className: 'panel__title' }, [icon('zap'), 'Motore multimediale']),
        media.available ? chip('operativo', 'ok') : chip('assente', 'bad')
    ]);

    const body = media.available
        ? el('div', { className: 'panel__body' }, [
            el('div', { className: 'spec-grid' }, [
                el('div', { className: 'spec' }, [
                    el('span', { className: 'spec__k', textContent: 'Versione' }),
                    el('span', { className: 'spec__v', textContent: media.ffmpegVersion ?? '--' })
                ]),
                el('div', { className: 'spec' }, [
                    el('span', { className: 'spec__k', textContent: 'Percorso' }),
                    el('span', { className: 'spec__v truncate', textContent: media.ffmpegPath ?? '--' })
                ])
            ]),
            media.accelerators?.length
                ? el('div', { className: 'stack--tight' }, [
                    el('span', { className: 'section__hint', textContent: `${media.accelerators.length} accelerazioni hardware disponibili` }),
                    el('div', { className: 'row row--tight' }, media.accelerators.map((name) => chip(name, 'violet')))
                ])
                : null
        ])
        : el('div', { className: 'panel__body' }, [
            notice('error', media.reason ?? 'ffmpeg non disponibile'),
            el('span', { className: 'section__hint', textContent: 'Senza ffmpeg non sono possibili registrazione e riproduzione.' })
        ]);

    panel.append(head, body);
    return panel;
}

function resourcePanel(info) {
    const memoryUsed = info.totalMemoryBytes > 0
        ? ((info.totalMemoryBytes - info.freeMemoryBytes) / info.totalMemoryBytes) * 100
        : 0;
    const disk = info.storage.mediaDisk;

    return el('section', { className: 'panel rise rise-2' }, [
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title' }, [icon('cpu'), 'Risorse'])
        ]),
        el('div', { className: 'panel__body' }, [
            el('div', { className: 'row', style: null }, [
                ring(memoryUsed, 'memoria', 'var(--cyan)'),
                disk ? ring(disk.usedPercent, 'disco', disk.usedPercent > 85 ? 'var(--bad)' : 'var(--accent)') : null,
                el('div', { className: 'stack--tight spacer' }, [
                    el('div', { className: 'spec' }, [
                        el('span', { className: 'spec__k', textContent: 'Memoria libera' }),
                        el('span', { className: 'spec__v', textContent: formatBytes(info.freeMemoryBytes) })
                    ]),
                    el('div', { className: 'spec' }, [
                        el('span', { className: 'spec__k', textContent: 'Core disponibili' }),
                        el('span', { className: 'spec__v', textContent: String(info.cpus) })
                    ]),
                    disk
                        ? el('div', { className: 'spec' }, [
                            el('span', { className: 'spec__k', textContent: 'Spazio archivio' }),
                            el('span', { className: 'spec__v', textContent: `${formatBytes(disk.freeBytes)} liberi` })
                        ])
                        : null
                ])
            ])
        ])
    ]);
}

function eventFeed() {
    const list = el('div', { className: 'feed' }, [empty('Nessun evento in questa sessione.')]);
    let count = 0;

    window.addEventListener('argus:event', (event) => {
        const detail = event.detail;
        if (count === 0) list.replaceChildren();
        count += 1;

        list.prepend(el('div', { className: 'feed__row' }, [
            icon('activity'),
            chip(detail.topic, 'info'),
            el('span', { className: 'spacer' }),
            el('span', { className: 'mono section__hint', textContent: new Date(detail.at).toLocaleTimeString() })
        ]));

        while (list.children.length > 60) list.lastChild.remove();
    });

    return el('section', { className: 'panel rise rise-4' }, [
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title' }, [icon('activity'), 'Eventi in tempo reale']),
            chip('live', 'ok')
        ]),
        el('div', { className: 'panel__body' }, [list])
    ]);
}

function archivePanel(info) {
    return el('section', { className: 'panel rise rise-5' }, [
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title' }, [icon('archive'), 'Archivio'])
        ]),
        el('div', { className: 'spec-grid' }, [
            el('div', { className: 'spec' }, [
                el('span', { className: 'spec__k', textContent: 'Configurazione' }),
                el('span', { className: 'spec__v break', textContent: info.storage.dataDir })
            ]),
            el('div', { className: 'spec' }, [
                el('span', { className: 'spec__k', textContent: 'Registrazioni' }),
                el('span', { className: 'spec__v break', textContent: info.storage.mediaDir })
            ])
        ]),
        el('div', { className: 'panel__body' }, [
            notice('warn', 'Registrazione e riproduzione non sono ancora attive in questa versione.')
        ])
    ]);
}

export async function renderDashboard({ api }) {
    const info = await api.get('/api/system/info');
    const disk = info.storage.mediaDisk;

    return el('div', { className: 'view' }, [
        heroBand(info),

        el('div', { className: 'grid grid--stats' }, [
            statCard({ icon: 'camera', label: 'Telecamere', value: String(info.cameraCount), hint: 'canali configurati', color: 'var(--accent)' }, 1),
            statCard({ icon: 'record', label: 'Registrazione', value: '0', hint: 'flussi attivi', color: 'var(--rose)' }, 2),
            statCard({ icon: 'cpu', label: 'Processore', value: String(info.cpus), hint: 'core disponibili', color: 'var(--violet)' }, 3),
            statCard({ icon: 'memory', label: 'Memoria', value: formatBytes(info.freeMemoryBytes), hint: `su ${formatBytes(info.totalMemoryBytes)}`, color: 'var(--cyan)' }, 4),
            statCard({
                icon: 'disk',
                label: 'Disco archivio',
                value: disk ? `${disk.usedPercent}%` : 'n/d',
                hint: disk ? `${formatBytes(disk.freeBytes)} liberi` : 'non leggibile',
                color: disk && disk.usedPercent > 85 ? 'var(--bad)' : 'var(--ok)'
            }, 5)
        ]),

        el('div', { className: 'grid grid--cards' }, [
            resourcePanel(info),
            mediaPanel(info.media)
        ]),

        el('div', { className: 'grid grid--cards' }, [
            eventFeed(),
            archivePanel(info)
        ])
    ]);
}
