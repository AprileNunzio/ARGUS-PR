import { api } from '/assets/api.js';
import { el, field } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

export function renderLogin({ message, onSuccess, onRecovery }) {
    const cardContent = el('div', { className: 'stack' });

    const card = el('div', { className: 'login__card' }, [
        el('div', { className: 'login__brand' }, [
            el('span', { className: 'brand__mark' }, [icon('shield')]),
            el('div', {}, [
                el('h1', { className: 'login__title', textContent: 'ARGUS-PR' }),
                el('p', { className: 'login__sub', textContent: 'Network Video Recorder by NunzioTech' })
            ])
        ]),
        cardContent
    ]);

    function showPasswordStep(initialMessage = null) {
        const username = el('input', { className: 'input', type: 'text', name: 'username', autocomplete: 'username', required: 'required' });
        const password = el('input', { className: 'input', type: 'password', name: 'password', autocomplete: 'current-password', required: 'required' });
        const feedback = el('div', { className: 'notice notice--error', hidden: 'hidden' });
        const submit = el('button', { className: 'btn btn--primary', type: 'submit', textContent: 'Accedi' });

        if (initialMessage) {
            feedback.textContent = initialMessage;
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
                    .then((res) => ({ ok: true, data: res }))
                    .catch((error) => ({ ok: false, error }));

                submit.disabled = false;
                submit.textContent = 'Accedi';

                if (!outcome.ok) {
                    feedback.textContent = outcome.error.message;
                    feedback.removeAttribute('hidden');
                    password.value = '';
                    password.focus();
                    return;
                }

                if (outcome.data?.mfaRequired) {
                    showMfaStep(outcome.data.challenge, username.value);
                    return;
                }

                await onSuccess();
            }
        }, [
            field('Utente', username),
            field('Password', password),
            feedback,
            submit,
            el('button', {
                className: 'btn btn--ghost btn--block',
                type: 'button',
                textContent: 'Ho dimenticato la password',
                onclick: () => onRecovery?.()
            })
        ]);

        cardContent.replaceChildren(form);
        queueMicrotask(() => username.focus());
    }

    function showMfaStep(challenge, userLabel) {
        const codeInput = el('input', {
            className: 'input',
            type: 'text',
            autocomplete: 'one-time-code',
            placeholder: 'Codice a 6 cifre o di recupero',
            required: 'required'
        });
        const feedback = el('div', { className: 'notice notice--error', hidden: 'hidden' });
        const submit = el('button', { className: 'btn btn--primary', type: 'submit', textContent: 'Verifica codice' });
        const cancel = el('button', {
            className: 'btn btn--secondary',
            type: 'button',
            textContent: 'Annulla',
            onclick: () => showPasswordStep()
        });

        const form = el('form', {
            className: 'stack',
            onsubmit: async (event) => {
                event.preventDefault();
                feedback.setAttribute('hidden', 'hidden');
                submit.disabled = true;
                submit.textContent = 'Verifica…';

                const outcome = await api
                    .post('/api/auth/mfa', { challenge, code: codeInput.value.trim() })
                    .then(() => ({ ok: true }))
                    .catch((error) => ({ ok: false, error }));

                submit.disabled = false;
                submit.textContent = 'Verifica codice';

                if (!outcome.ok) {
                    feedback.textContent = outcome.error.message;
                    feedback.removeAttribute('hidden');
                    codeInput.value = '';
                    codeInput.focus();
                    return;
                }

                await onSuccess();
            }
        }, [
            el('p', { textContent: `Autenticazione a due fattori richiesta per ${userLabel}.` }),
            field('Codice di sicurezza', codeInput),
            feedback,
            el('div', { className: 'row' }, [submit, cancel])
        ]);

        cardContent.replaceChildren(form);
        queueMicrotask(() => codeInput.focus());
    }

    showPasswordStep(message);
    return el('div', { className: 'login' }, [card]);
}
