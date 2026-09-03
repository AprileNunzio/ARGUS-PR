import { el, chip, notice, pageHead } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { go } from '/assets/router.js';
import { backLink } from './camera_wizard.js';

const STATUS_TONE = Object.freeze({ ok: 'ok', warn: 'warn', fail: 'bad', skip: 'info' });
const STATUS_GLYPH = Object.freeze({ ok: 'check', warn: 'warning', fail: 'close', skip: 'info' });
const STATUS_TEXT = Object.freeze({ ok: 'riuscito', warn: 'attenzione', fail: 'fallito', skip: 'saltato' });

const PATCH_LABELS = Object.freeze({
    inputFormat: 'formato',
    captureWidth: 'larghezza',
    captureHeight: 'altezza',
    captureFps: 'fotogrammi',
    transport: 'trasporto'
});

function stepRow(label) {
    const badge = chip('in attesa', 'info');
    const detail = el('span', { className: 'section__hint', textContent: 'non ancora eseguito' });
    const glyph = el('span', { className: 'auto-step__icon' }, [icon('clock')]);

    const node = el('div', { className: 'auto-step' }, [
        glyph,
        el('div', { className: 'stack stack--tight' }, [el('strong', { textContent: label }), detail]),
        badge
    ]);

    return {
        node,
        update(status, text) {
            badge.className = `chip chip--${STATUS_TONE[status] ?? 'info'}`;
            badge.textContent = STATUS_TEXT[status] ?? status;
            detail.textContent = text;
            glyph.replaceChildren(icon(STATUS_GLYPH[status] ?? 'info'));
            node.className = `auto-step auto-step--${status}`;
        }
    };
}

function describePatch(patch) {
    return Object.entries(patch)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key, value]) => `${PATCH_LABELS[key] ?? key}: ${value}`)
        .join(' · ');
}

export async function renderAutoconfigurePage({ api, cameraId }) {
    const camera = await api.get(`/api/cameras/${cameraId}`)
        .then((result) => result.camera)
        .catch(() => null);

    if (!camera) {
        return el('div', { className: 'view' }, [
            pageHead({ title: 'Autoconfigurazione', back: backLink('Torna all elenco', 'cameras') }),
            notice('warn', 'Il canale richiesto non esiste piu.')
        ]);
    }

    const rows = new Map();
    const stepHost = el('div', { className: 'stack stack--tight' });
    const feedback = el('div', { hidden: 'hidden' });

    const startButton = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Avvia autoconfigurazione' });
    const applyButton = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Applica e salva', hidden: 'hidden' });

    let finalPatch = {};

    async function run() {
        startButton.disabled = true;
        applyButton.setAttribute('hidden', 'hidden');
        feedback.setAttribute('hidden', 'hidden');
        rows.clear();
        stepHost.replaceChildren();
        finalPatch = {};

        let state = {};
        let step;
        let first = true;

        while (first || step) {
            const outcome = await api.post(`/api/cameras/${cameraId}/autoconfigure`, { step, state })
                .then((value) => ({ value }))
                .catch((error) => ({ error }));

            if (outcome.error) {
                feedback.replaceChildren(notice('error', outcome.error.message));
                feedback.removeAttribute('hidden');
                startButton.disabled = false;
                return;
            }

            const result = outcome.value;

            if (first) {
                for (const id of result.steps) {
                    const row = stepRow(id === result.step ? result.label : id);
                    rows.set(id, row);
                    stepHost.append(row.node);
                }
                first = false;
            }

            rows.get(result.step)?.update(result.status, result.detail);

            state = result.state;
            finalPatch = result.state?.patch ?? {};
            step = result.next;

            if (result.status === 'fail') break;
        }

        startButton.disabled = false;
        startButton.textContent = 'Ripeti autoconfigurazione';

        if (Object.keys(finalPatch).length > 0) {
            feedback.replaceChildren(notice('info', `Configurazione suggerita — ${describePatch(finalPatch)}`));
            applyButton.removeAttribute('hidden');
        } else {
            feedback.replaceChildren(notice('ok', 'Nessuna modifica necessaria: la configurazione attuale funziona.'));
        }

        feedback.removeAttribute('hidden');
    }

    startButton.addEventListener('click', run);

    applyButton.addEventListener('click', async () => {
        applyButton.disabled = true;

        const outcome = await api.put(`/api/cameras/${cameraId}`, finalPatch)
            .then(() => null)
            .catch((error) => error);

        applyButton.disabled = false;

        if (outcome) {
            feedback.replaceChildren(notice('error', outcome.message));
            return;
        }

        go('cameras', cameraId, 'diagnostics');
    });

    return el('div', { className: 'view' }, [
        pageHead({
            title: `Autoconfigurazione · ${camera.name}`,
            hint: 'Ogni passo esegue una prova reale sulla sorgente: presenza, apertura, formato, anteprima, registrazione e alimentazione dell analisi',
            back: backLink('Torna alla diagnostica', 'cameras', cameraId, 'diagnostics')
        }),
        el('section', { className: 'panel' }, [
            el('div', { className: 'panel__body stack' }, [
                stepHost,
                feedback,
                el('div', { className: 'row row--end' }, [startButton, applyButton])
            ])
        ])
    ]);
}
