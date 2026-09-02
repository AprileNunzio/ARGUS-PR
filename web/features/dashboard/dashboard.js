import { el, chip, formatBytes, formatDuration, empty } from '/assets/dom.js';

function statCard(label, value, hint, tone) {
    return el('div', { className: 'card' }, [
        el('div', { className: 'card__label', textContent: label }),
        el('div', { className: tone ? `card__value card__value--${tone}` : 'card__value', textContent: value }),
        hint ? el('div', { className: 'card__hint', textContent: hint }) : null
    ]);
}

function mediaPanel(media) {
    const body = media.available
        ? el('div', { className: 'panel__body' }, [
            el('div', { className: 'row' }, [
                chip('operativo', 'ok'),
                el('span', { className: 'card__hint', textContent: media.ffmpegVersion })
            ]),
            el('div', { className: 'card__hint', textContent: media.ffmpegPath }),
            el('div', { className: 'row row--tight' },
                (media.accelerators ?? []).map((name) => chip(name, 'info')))
        ])
        : el('div', { className: 'panel__body' }, [
            el('div', { className: 'notice notice--error', textContent: media.reason ?? 'ffmpeg non disponibile' }),
            el('div', { className: 'card__hint', textContent: 'Installa ffmpeg oppure imposta ARGUS_FFMPEG_PATH. Senza ffmpeg non sono possibili né registrazione né riproduzione.' })
        ]);

    return el('section', { className: 'panel' }, [
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title', textContent: 'Motore multimediale' })
        ]),
        body
    ]);
}

function eventFeed() {
    const list = el('div', { className: 'panel__body stack--tight scroll-list' }, [
        empty('Nessun evento ricevuto in questa sessione.')
    ]);

    let count = 0;

    window.addEventListener('argus:event', (event) => {
        const detail = event.detail;
        if (count === 0) list.replaceChildren();
        count += 1;

        const row = el('div', { className: 'feed-row' }, [
            chip(detail.topic, 'info'),
            el('span', { className: 'card__hint', textContent: new Date(detail.at).toLocaleTimeString() })
        ]);

        list.prepend(row);
        while (list.children.length > 50) list.lastChild.remove();
    });

    return el('section', { className: 'panel' }, [
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title', textContent: 'Eventi in tempo reale' })
        ]),
        list
    ]);
}

export async function renderDashboard({ api }) {
    const info = await api.get('/api/system/info');
    const disk = info.storage.mediaDisk;

    const view = el('div', { className: 'view' }, [
        el('div', { className: 'view__head' }, [
            el('div', {}, [
                el('h1', { className: 'view__title', textContent: 'Riepilogo sistema' }),
                el('p', { className: 'view__sub', textContent: `${info.hostname} · ${info.platform}` })
            ]),
            chip(`v${info.version}`, 'info')
        ]),

        el('div', { className: 'grid grid--stats' }, [
            statCard('Telecamere', String(info.cameraCount), 'canali configurati'),
            statCard('Attività', formatDuration(info.uptimeSeconds), 'dall\'ultimo avvio', 'ok'),
            statCard('CPU', String(info.cpus), 'core disponibili'),
            statCard('Memoria libera', formatBytes(info.freeMemoryBytes), `su ${formatBytes(info.totalMemoryBytes)}`),
            disk
                ? statCard('Disco media', `${disk.usedPercent}%`, `${formatBytes(disk.freeBytes)} liberi`, disk.usedPercent > 90 ? 'bad' : null)
                : statCard('Disco media', 'n/d', 'lettura non supportata', 'muted')
        ]),

        el('div', { className: 'grid grid--cards' }, [
            mediaPanel(info.media),
            eventFeed()
        ]),

        el('section', { className: 'panel' }, [
            el('div', { className: 'panel__head' }, [
                el('span', { className: 'panel__title', textContent: 'Archivio' })
            ]),
            el('div', { className: 'panel__body' }, [
                el('div', { className: 'card__hint', textContent: `Dati: ${info.storage.dataDir}` }),
                el('div', { className: 'card__hint', textContent: `Media: ${info.storage.mediaDir}` }),
                el('div', { className: 'notice notice--warn', textContent: 'Registrazione e riproduzione non sono ancora attive in questa versione. Vedi la roadmap nel README.' })
            ])
        ])
    ]);

    return view;
}
