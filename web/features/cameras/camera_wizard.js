import { el, notice, chip } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { createCameraForm, SOURCE_KINDS } from './camera_form.js';

function kindCard(entry, onPick) {
    return el('button', { className: 'kind-card', type: 'button', onclick: () => onPick(entry.id) }, [
        el('span', { className: 'kind-card__icon' }, [icon(entry.glyph, { className: 'icon--lg' })]),
        el('span', { className: 'kind-card__body' }, [
            el('strong', { textContent: entry.title }),
            el('span', { className: 'section__hint', textContent: entry.hint })
        ])
    ]);
}

function probeSummary(result) {
    const items = [];
    if (result.video) {
        items.push(chip(`${result.video.width ?? '?'}x${result.video.height ?? '?'}`, 'ok'));
        items.push(chip(result.video.codec ?? 'video', 'info'));
        if (result.video.frameRate) items.push(chip(`${result.video.frameRate} fps`, 'info'));
    }
    if (result.audio) items.push(chip(`audio ${result.audio.codec}`, 'info'));
    if (result.container) items.push(chip(result.container, 'info'));
    return el('div', { className: 'row row--tight' }, items);
}

export function renderCameraWizard({ api, prefill = null, onSaved, onCancel }) {
    const body = el('div', { className: 'panel__body' });
    const title = el('span', { className: 'panel__title', textContent: 'Nuovo canale' });

    const host = el('section', { className: 'panel rise' }, [
        el('div', { className: 'panel__head' }, [
            title,
            el('button', { className: 'btn btn--sm btn--ghost', type: 'button', textContent: 'Chiudi', onclick: onCancel })
        ]),
        body
    ]);

    function chooseKind() {
        title.textContent = 'Nuovo canale · tipo di sorgente';
        body.replaceChildren(el('div', { className: 'kind-grid' }, SOURCE_KINDS.map((entry) => kindCard(entry, configure))));
    }

    function configure(kind) {
        const descriptor = SOURCE_KINDS.find((entry) => entry.id === kind);
        title.textContent = `Nuovo canale · ${descriptor.title}`;

        const form = createCameraForm({ api, kind, camera: prefill });
        const feedback = el('div', { hidden: 'hidden' });

        const probeButton = el('button', { className: 'btn', type: 'button', textContent: 'Verifica sorgente' });
        const saveButton = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Salva canale' });

        const fail = (error) => {
            feedback.replaceChildren(notice('error', error.message));
            feedback.removeAttribute('hidden');
        };

        probeButton.addEventListener('click', async () => {
            probeButton.disabled = true;
            probeButton.textContent = 'Verifica in corso…';
            feedback.setAttribute('hidden', 'hidden');

            const outcome = await api.post('/api/cameras/probe', form.values())
                .then((result) => ({ result }))
                .catch((error) => ({ error }));

            probeButton.disabled = false;
            probeButton.textContent = 'Verifica sorgente';

            if (outcome.error) return fail(outcome.error);

            feedback.replaceChildren(
                notice('ok', 'Sorgente raggiungibile.'),
                probeSummary(outcome.result)
            );
            feedback.removeAttribute('hidden');
        });

        saveButton.addEventListener('click', async () => {
            saveButton.disabled = true;
            feedback.setAttribute('hidden', 'hidden');

            const outcome = await api.post('/api/cameras', form.values())
                .then((result) => ({ result }))
                .catch((error) => ({ error }));

            saveButton.disabled = false;

            if (outcome.error) return fail(outcome.error);
            await onSaved(outcome.result.camera);
        });

        body.replaceChildren(el('div', { className: 'stack' }, [
            form.node,
            feedback,
            el('div', { className: 'row row--end' }, [
                el('button', { className: 'btn btn--ghost', type: 'button', textContent: 'Indietro', onclick: chooseKind }),
                probeButton,
                saveButton
            ])
        ]));
    }

    if (prefill?.sourceKind) configure(prefill.sourceKind);
    else chooseKind();

    return host;
}

export { probeSummary };
