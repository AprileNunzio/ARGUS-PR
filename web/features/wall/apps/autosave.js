import { el } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

const DEBOUNCE_MS = 500;

export function createAutoSaver({ api, path = '/api/wall/config', onApplied }) {
    const indicator = el('span', { className: 'autosave' }, [
        el('span', { className: 'autosave__dot' }),
        el('span', { className: 'autosave__text', textContent: 'Modifiche salvate automaticamente' })
    ]);

    let timer = null;
    let pending = null;
    let inFlight = false;

    const paint = (state, text) => {
        indicator.className = `autosave autosave--${state}`;
        indicator.querySelector('.autosave__text').textContent = text;
    };

    const flush = async () => {
        if (inFlight || pending === null) return;

        const body = pending;
        pending = null;
        inFlight = true;
        paint('busy', 'Salvataggio in corso…');

        const result = await api.put(path, body).catch((error) => ({ failure: error }));
        inFlight = false;

        if (result.failure) {
            paint('error', `Salvataggio non riuscito: ${result.failure.message}`);
            return;
        }

        const stamp = new Date().toLocaleTimeString('it-IT');
        paint('ok', `Salvato alle ${stamp} e applicato al muro`);
        onApplied?.(result);

        if (pending !== null) flush();
    };

    return {
        element: indicator,
        save(config) {
            pending = JSON.parse(JSON.stringify(config));
            paint('busy', 'Modifica in attesa di salvataggio…');
            if (timer) clearTimeout(timer);
            timer = setTimeout(flush, DEBOUNCE_MS);
        },
        stop() {
            if (timer) clearTimeout(timer);
        }
    };
}

export function autosaveBar(indicator, extra = []) {
    return el('div', { className: 'autosave-bar' }, [
        el('span', { className: 'autosave-bar__icon' }, [icon('check')]),
        indicator,
        el('span', { className: 'spacer' }),
        ...extra
    ]);
}
