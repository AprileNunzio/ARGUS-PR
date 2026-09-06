import { api } from '/assets/api.js';
import { el, field, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

export function renderChangePassword({ session, onComplete }) {
    const current = el('input', { className: 'input', type: 'password', autocomplete: 'current-password' });
    const next = el('input', { className: 'input', type: 'password', autocomplete: 'new-password' });
    const confirm = el('input', { className: 'input', type: 'password', autocomplete: 'new-password' });

    const feedback = el('div', {});
    const submit = el('button', { className: 'btn btn--primary', type: 'submit', textContent: 'Aggiorna password' });

    const form = el('form', {
        className: 'stack',
        onsubmit: async (event) => {
            event.preventDefault();
            feedback.replaceChildren();

            if (next.value !== confirm.value) {
                feedback.replaceChildren(notice('error', 'Le due password non coincidono.'));
                return;
            }

            submit.disabled = true;
            submit.textContent = 'Aggiornamento…';

            const outcome = await api.post('/api/auth/password', {
                currentPassword: current.value,
                newPassword: next.value
            }).then(() => null).catch((error) => error);

            submit.disabled = false;
            submit.textContent = 'Aggiorna password';

            if (outcome) {
                const problems = outcome.details?.problems;
                feedback.replaceChildren(notice('error',
                    problems ? `${outcome.message}: ${problems.join(', ')}` : outcome.message));
                return;
            }

            await onComplete();
        }
    }, [
        el('h2', { className: 'view__title', textContent: 'Cambia la password' }),
        el('p', { className: 'view__sub', textContent: `La password di ${session.username} deve essere sostituita prima di usare il sistema.` }),
        field('Password attuale', current),
        field('Nuova password', next),
        field('Conferma nuova password', confirm),
        feedback,
        submit
    ]);

    const card = el('div', { className: 'login__card' }, [
        el('div', { className: 'login__brand' }, [
            el('span', { className: 'brand__mark' }, [icon('shield')]),
            el('div', {}, [
                el('h1', { className: 'login__title', textContent: 'ARGUS-PR' }),
                el('p', { className: 'login__sub', textContent: 'Network Video Recorder by NunzioTech' })
            ])
        ]),
        form
    ]);

    queueMicrotask(() => current.focus());
    return el('div', { className: 'login' }, [card]);
}
