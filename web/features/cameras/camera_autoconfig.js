import { el, chip, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

const STATUS_TONE = Object.freeze({ ok: 'ok', warn: 'warn', fail: 'bad', skip: 'info', running: 'info' });
const STATUS_GLYPH = Object.freeze({ ok: 'check', warn: 'warning', fail: 'close', skip: 'info', running: 'refresh' });
const STATUS_TEXT = Object.freeze({ ok: 'riuscito', warn: 'attenzione', fail: 'fallito', skip: 'saltato', running: 'in corso' });

function stepRow(label) {
    const badge = chip('in attesa', 'info');
    const detail = el('span', { className: 'section__hint', textContent: 'non ancora eseguito' });
    const glyph = el('span', { className: 'auto-step__icon' }, [icon('clock')]);

    const node = el('div', { className: 'auto-step' }, [
        glyph,
        el('div', { className: 'stack stack--tight' }, [
            el('strong', { textContent: label }),
            detail
        ]),
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
    const labels = {
        inputFormat: 'formato',
        captureWidth: 'larghezza',
        captureHeight: 'altezza',
        captureFps: 'fotogrammi',
        transport: 'trasporto'
    };

    return Object.entries(patch)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key, value]) => `${labels[key] ?? key}: ${value}`)
        .join(' · ');
}

export function renderAutoconfigure({ api, camera = null, payload = null, onApplied, onClose }) {
    const host = el('section', { className: 'panel rise' });
    const body = el('div', { className: 'panel__body stack' });
    const feedback = el('div', { hidden: 'hidden' });
    const rows = new Map();
    const stepHost = el('div', { className: 'stack stack--tight' });

    const startButton = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Avvia autoconfigurazione' });
    const applyButton = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Applica e salva', hidden: 'hidden' });

    let finalPatch = {};

    const endpoint = camera ? `/api/cameras/${camera.id}/autoconfigure` : '/api/cameras/autoconfigure';

    const requestStep = (step, state) => api.post(endpoint, camera
        ? { step, state }
        : { camera: payload, step, state });

    async function run() {
        startButton.disabled = true;
        applyButton.setAttribute('hidden', 'hidden');
        feedback.setAttribute('hidden', 'hidden');
        rows.clear();
        stepHost.replaceChildren();
        finalPatch = {};

        let state = {};
        let step = null;
        let first = true;

        while (first || step) {
            const outcome = await requestStep(step ?? undefined, state)
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

            const row = rows.get(result.step);
            if (row) row.update(result.status, result.detail);

            state = result.state;
            finalPatch = result.state?.patch ?? {};
            step = result.next;

            if (result.status === 'fail') break;
        }

        startButton.disabled = false;
        startButton.textContent = 'Ripeti autoconfigurazione';

        if (Object.keys(finalPatch).length > 0) {
            feedback.replaceChildren(notice('info', `Configurazione suggerita — ${describePatch(finalPatch)}`));
            feedback.removeAttribute('hidden');
            applyButton.removeAttribute('hidden');
        } else {
            feedback.replaceChildren(notice('ok', 'Nessuna modifica necessaria: la configurazione attuale funziona.'));
            feedback.removeAttribute('hidden');
        }
    }

    startButton.addEventListener('click', run);

    applyButton.addEventListener('click', async () => {
        applyButton.disabled = true;

        if (camera) {
            const outcome = await api.put(`/api/cameras/${camera.id}`, finalPatch)
                .then(() => null)
                .catch((error) => error);

            applyButton.disabled = false;

            if (outcome) {
                feedback.replaceChildren(notice('error', outcome.message));
                return;
            }
        }

        applyButton.disabled = false;
        await onApplied?.(finalPatch);
    });

    body.append(
        el('p', { className: 'section__hint', textContent: 'Ogni passo esegue una prova reale sulla sorgente: presenza, apertura, formato, anteprima, registrazione e alimentazione dell analisi.' }),
        stepHost,
        feedback,
        el('div', { className: 'row row--end' }, [startButton, applyButton])
    );

    host.append(
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title', textContent: 'Autoconfigurazione guidata' }),
            onClose ? el('button', { className: 'btn btn--sm btn--ghost', type: 'button', textContent: 'Chiudi', onclick: onClose }) : null
        ]),
        body
    );

    return host;
}
