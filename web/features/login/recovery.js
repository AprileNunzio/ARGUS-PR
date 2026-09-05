import { el, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { api } from '/assets/api.js';
import { go } from '/assets/router.js';

function panel(children) {
    return el('div', { className: 'login' }, [
        el('div', { className: 'login__card' }, [
            el('div', { className: 'login__brand' }, [
                el('span', { className: 'brand__mark' }, [icon('shield')]),
                el('div', {}, [
                    el('h1', { className: 'login__title', textContent: 'ARGUS-PR' }),
                    el('p', { className: 'login__sub', textContent: 'Recupero delle credenziali' })
                ])
            ]),
            ...children
        ])
    ]);
}

export function renderRecoveryRequest({ onCancel }) {
    const feedback = el('div', {});
    const email = el('input', { className: 'input', type: 'email', autocomplete: 'email', placeholder: 'La tua email registrata' });

    const submit = el('button', { className: 'btn btn--primary btn--block', type: 'submit' }, [
        icon('globe'),
        el('span', { textContent: 'Invia il collegamento di recupero' })
    ]);

    const back = el('button', { className: 'btn btn--ghost btn--block', type: 'button' }, [
        icon('chevronLeft'),
        el('span', { textContent: 'Torna all accesso' })
    ]);

    back.addEventListener('click', () => onCancel());

    const form = el('form', { className: 'stack' }, [
        el('div', { className: 'field' }, [
            el('label', { textContent: 'Email' }),
            email,
            el('span', { className: 'field__hint', textContent: 'Deve essere l indirizzo registrato nella tua scheda utente' })
        ]),
        submit,
        back
    ]);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        submit.disabled = true;

        await api.post('/api/auth/recovery/request', { email: email.value }).catch(() => null);
        submit.disabled = false;

        feedback.replaceChildren(notice(
            'ok',
            'Se quell indirizzo corrisponde a un account attivo, il messaggio di recupero e in viaggio. Vale trenta minuti e si usa una volta sola.'
        ));
    });

    return panel([
        el('p', {
            className: 'login__sub',
            textContent: 'Ti mandiamo un collegamento valido trenta minuti. Il codice a sei cifre resta comunque necessario per entrare.'
        }),
        feedback,
        form
    ]);
}

export async function renderRecoveryComplete({ token, onDone, onCancel }) {
    const feedback = el('div', {});
    const status = await api.get(`/api/auth/recovery/${encodeURIComponent(token)}`).catch(() => ({ valid: false }));

    if (!status.valid) {
        const back = el('button', { className: 'btn btn--primary btn--block', type: 'button' }, [
            icon('chevronLeft'),
            el('span', { textContent: 'Torna all accesso' })
        ]);

        back.addEventListener('click', () => onCancel());

        return panel([
            notice('error', 'Questo collegamento non e valido o e gia scaduto. Richiedine un altro dalla pagina di accesso.'),
            back
        ]);
    }

    const password = el('input', { className: 'input', type: 'password', autocomplete: 'new-password' });
    const confirm = el('input', { className: 'input', type: 'password', autocomplete: 'new-password' });

    const submit = el('button', { className: 'btn btn--primary btn--block', type: 'submit' }, [
        icon('check'),
        el('span', { textContent: 'Imposta la nuova password' })
    ]);

    const form = el('form', { className: 'stack' }, [
        el('div', { className: 'field' }, [
            el('label', { textContent: 'Nuova password' }),
            password,
            el('span', { className: 'field__hint', textContent: 'Almeno dodici caratteri, con maiuscole, minuscole, cifre e simboli' })
        ]),
        el('div', { className: 'field' }, [
            el('label', { textContent: 'Ripeti la nuova password' }),
            confirm
        ]),
        submit
    ]);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (password.value !== confirm.value) {
            feedback.replaceChildren(notice('error', 'Le due password non coincidono.'));
            return;
        }

        submit.disabled = true;
        const result = await api.post(`/api/auth/recovery/${encodeURIComponent(token)}`, { password: password.value })
            .catch((error) => ({ failure: error }));
        submit.disabled = false;

        if (result.failure) {
            feedback.replaceChildren(notice('error', result.failure.message));
            return;
        }

        go('');
        onDone();
    });

    return panel([
        el('p', {
            className: 'login__sub',
            textContent: `Stai reimpostando la password di ${status.username}. Tutte le sessioni aperte di questo account verranno chiuse.`
        }),
        feedback,
        form
    ]);
}
