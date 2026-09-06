import { el, chip, notice, empty } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card } from '/assets/ui.js';

const ACCEPT = 'audio/wav,audio/mpeg,audio/ogg,audio/opus,audio/flac';
const MAX_BYTES = 4 * 1024 * 1024;

function readAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(String(reader.result)), { once: true });
        reader.addEventListener('error', () => reject(new Error('lettura del file non riuscita')), { once: true });
        reader.readAsDataURL(file);
    });
}

function humanSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function renderAudioLibrary({ api }) {
    const host = el('div', { className: 'xstack' });
    const feedback = el('div', {});

    let clips = await api.get('/api/audio/clips').then((payload) => payload.clips ?? []).catch(() => []);
    let cameras = await api.get('/api/audio/talkback').then((payload) => payload.cameras ?? []).catch(() => []);

    const reload = async () => {
        clips = await api.get('/api/audio/clips').then((payload) => payload.clips ?? []).catch(() => clips);
        render();
    };

    const uploadCard = () => {
        const nameInput = el('input', { className: 'input', placeholder: 'Esempio: Area videosorvegliata, allontanarsi' });
        const descriptionInput = el('input', { className: 'input', placeholder: 'Quando usarlo, a chi e rivolto' });
        const fileInput = el('input', { className: 'input', type: 'file', accept: ACCEPT });

        const submit = el('button', { className: 'btn btn--primary', type: 'button' }, [
            icon('plus'),
            el('span', { textContent: 'Aggiungi il messaggio' })
        ]);

        submit.addEventListener('click', async () => {
            const file = fileInput.files?.[0];

            if (!file) {
                feedback.replaceChildren(notice('warn', 'Scegli un file audio da caricare.'));
                return;
            }

            if (file.size > MAX_BYTES) {
                feedback.replaceChildren(notice('error', 'Il file supera i quattro megabyte consentiti.'));
                return;
            }

            submit.disabled = true;
            const data = await readAsBase64(file).catch((error) => ({ failure: error }));

            if (data.failure) {
                submit.disabled = false;
                feedback.replaceChildren(notice('error', data.failure.message));
                return;
            }

            const result = await api.post('/api/audio/clips', {
                name: nameInput.value.trim() || file.name.replace(/\.[^.]+$/, ''),
                description: descriptionInput.value.trim(),
                contentType: file.type || 'audio/wav',
                data
            }).catch((error) => ({ failure: error }));

            submit.disabled = false;

            if (result.failure) {
                feedback.replaceChildren(notice('error', `Caricamento non riuscito: ${result.failure.message}`));
                return;
            }

            feedback.replaceChildren(notice('ok', `Messaggio "${result.name}" aggiunto alla libreria.`));
            nameInput.value = '';
            descriptionInput.value = '';
            fileInput.value = '';
            await reload();
        });

        return card({
            title: 'Aggiungi un messaggio',
            subtitle: 'WAV, MP3, OGG, Opus o FLAC fino a quattro megabyte. Viene riconvertito in G.711 al momento dell invio',
            iconName: 'speaker',
            tone: 'cyan',
            body: [
                el('div', { className: 'field' }, [el('label', { textContent: 'Nome' }), nameInput]),
                el('div', { className: 'field' }, [el('label', { textContent: 'Descrizione' }), descriptionInput]),
                el('div', { className: 'field' }, [el('label', { textContent: 'File audio' }), fileInput]),
                el('div', { className: 'row row--end' }, [submit])
            ]
        });
    };

    const clipRow = (clip) => {
        const remove = el('button', { className: 'btn btn--sm btn--danger', type: 'button' }, [
            icon('trash'),
            el('span', { textContent: 'Elimina' })
        ]);

        remove.addEventListener('click', async () => {
            remove.disabled = true;
            const result = await api.remove(`/api/audio/clips/${encodeURIComponent(clip.id)}`).catch((error) => ({ failure: error }));
            remove.disabled = false;

            if (result.failure) {
                feedback.replaceChildren(notice('error', `Eliminazione non riuscita: ${result.failure.message}`));
                return;
            }

            feedback.replaceChildren(notice('ok', `Messaggio "${clip.name}" eliminato.`));
            await reload();
        });

        return el('div', { className: 'xrow' }, [
            el('span', { className: 'xrow__icon' }, [icon('speaker')]),
            el('div', { className: 'xrow__body' }, [
                el('span', { className: 'xrow__title', textContent: clip.name }),
                el('span', { className: 'xrow__hint', textContent: clip.description ?? 'Nessuna descrizione' })
            ]),
            chip(humanSize(clip.byteSize), 'info'),
            remove
        ]);
    };

    const capabilityCard = () => card({
        title: 'Telecamere raggiungibili',
        subtitle: 'Il messaggio parte solo verso le telecamere che dichiarano un canale audio in ingresso ONVIF',
        iconName: 'camera',
        tone: 'emerald',
        badge: chip(`${cameras.filter((entry) => entry.supported).length}/${cameras.length} pronte`, 'info'),
        body: cameras.length === 0
            ? [empty('Nessuna telecamera attiva.')]
            : cameras.map((entry) => el('div', { className: 'xrow' }, [
                el('span', { className: 'xrow__icon' }, [icon(entry.supported ? 'speaker' : 'speakerOff')]),
                el('div', { className: 'xrow__body' }, [
                    el('span', { className: 'xrow__title', textContent: entry.name }),
                    el('span', {
                        className: 'xrow__hint',
                        textContent: entry.supported
                            ? `Canale audio ${entry.codec}${entry.declared ? ', dichiarato ONVIF' : ', dedotto dall SDP'}`
                            : entry.reason ?? 'canale audio non disponibile'
                    })
                ]),
                chip(entry.supported ? 'Pronta' : 'Non disponibile', entry.supported ? 'ok' : 'warn')
            ]))
    });

    const render = () => {
        host.replaceChildren(
            feedback,
            uploadCard(),
            card({
                title: 'Messaggi in libreria',
                subtitle: 'Compaiono nella barra di ogni riquadro del muro, sotto il pulsante altoparlante',
                iconName: 'archive',
                tone: 'purple',
                badge: chip(`${clips.length} messaggi`, clips.length > 0 ? 'ok' : 'info'),
                body: clips.length === 0
                    ? [empty('Nessun messaggio in libreria.')]
                    : clips.map(clipRow)
            }),
            capabilityCard()
        );
    };

    render();
    return host;
}
