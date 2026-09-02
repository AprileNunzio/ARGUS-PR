import { api } from '/assets/api.js';
import { el, field, brandMark } from '/assets/dom.js';

export function renderLogin({ message, onSuccess }) {
    const username = el('input', { className: 'input', type: 'text', name: 'username', autocomplete: 'username', required: 'required' });
    const password = el('input', { className: 'input', type: 'password', name: 'password', autocomplete: 'current-password', required: 'required' });
    const feedback = el('div', { className: 'notice notice--error', hidden: 'hidden' });
    const submit = el('button', { className: 'btn btn--primary', type: 'submit', textContent: 'Accedi' });

    if (message) {
        feedback.textContent = message;
        feedback.removeAttribute('hidden');
    }

    const form = el('form', {
        className: 'stack',
        onsubmit: async (event) => {
            event.preventDefault();
            feedback.setAttribute('hidden', 'hidden');
            submit.disabled = true;
            submit.textContent = 'Verifica…';

            const outcome = await api
                .post('/api/auth/login', { username: username.value, password: password.value })
                .then(() => null)
                .catch((error) => error);

            submit.disabled = false;
            submit.textContent = 'Accedi';

            if (outcome) {
                feedback.textContent = outcome.message;
                feedback.removeAttribute('hidden');
                password.value = '';
                password.focus();
                return;
            }

            await onSuccess();
        }
    }, [
        field('Utente', username),
        field('Password', password),
        feedback,
        submit
    ]);

    const card = el('div', { className: 'login__card' }, [
        el('div', { className: 'login__brand' }, [
            brandMark(),
            el('div', {}, [
                el('h1', { className: 'login__title', textContent: 'ARGUS-PR' }),
                el('p', { className: 'login__sub', textContent: 'Network Video Recorder' })
            ])
        ]),
        form
    ]);

    const wrapper = el('div', { className: 'login' }, [card]);
    queueMicrotask(() => username.focus());
    return wrapper;
}
