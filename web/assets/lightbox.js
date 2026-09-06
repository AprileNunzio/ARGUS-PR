import { el } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

let host = null;

function close() {
    if (!host) return;
    host.remove();
    host = null;
    document.removeEventListener('keydown', onKey);
}

function onKey(event) {
    if (event.key === 'Escape') close();
}

export function openLightbox({ src, title = '', caption = '', downloadName = null }) {
    close();

    const image = el('img', { className: 'lightbox__image', src, alt: title || 'Immagine' });
    let actual = false;

    const zoomButton = el('button', {
        type: 'button',
        className: 'btn btn--sm',
        title: 'Alterna fra adatta alla finestra e dimensione reale',
        onclick: () => {
            actual = !actual;
            image.classList.toggle('lightbox__image--actual', actual);
            const label = zoomButton.querySelector('span');
            if (label) label.textContent = actual ? 'Adatta' : 'Dimensione reale';
        }
    }, [icon('search'), el('span', { textContent: 'Dimensione reale' })]);

    const meta = el('span', { className: 'section__hint mono', textContent: 'caricamento…' });
    image.addEventListener('load', () => {
        meta.textContent = `${image.naturalWidth} × ${image.naturalHeight} px`;
    });
    image.addEventListener('error', () => {
        meta.textContent = 'immagine non disponibile';
    });

    const actions = [zoomButton];
    if (downloadName) {
        actions.push(el('a', {
            className: 'btn btn--sm',
            href: src,
            download: downloadName,
            title: 'Scarica l\'immagine originale'
        }, [icon('download'), el('span', { textContent: 'Scarica' })]));
    }
    actions.push(el('button', {
        type: 'button',
        className: 'btn btn--sm btn--ghost',
        onclick: close,
        title: 'Chiudi (Esc)'
    }, [icon('close'), el('span', { textContent: 'Chiudi' })]));

    const frame = el('div', { className: 'lightbox__frame' }, [
        el('div', { className: 'lightbox__bar row row--tight' }, [
            el('strong', { textContent: title }),
            meta,
            el('span', { className: 'spacer' }),
            ...actions
        ]),
        el('div', { className: 'lightbox__stage' }, [image]),
        caption ? el('div', { className: 'lightbox__caption section__hint', textContent: caption }) : null
    ]);

    frame.addEventListener('click', (event) => event.stopPropagation());

    host = el('div', { className: 'lightbox', onclick: close }, [frame]);
    document.body.append(host);
    document.addEventListener('keydown', onKey);
}
