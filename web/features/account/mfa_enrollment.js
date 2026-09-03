import { api } from '/assets/api.js';
import { el, field, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { renderQrSvg } from './qr.js';

export function renderMfaEnrollment({ session, onComplete }) {
    const feedback = el('div', {});
    const content = el('div', { className: 'stack' });

    const card = el('div', { className: 'login__card login__card--mfa' }, [
        el('div', { className: 'login__brand' }, [
            el('span', { className: 'brand__mark' }, [icon('shield')]),
            el('div', {}, [
                el('h1', { className: 'login__title', textContent: 'Autenticazione a due fattori (MFA)' }),
                el('p', { className: 'login__sub', textContent: 'Proteggi l account con un app di autenticazione' })
            ])
        ]),
        content
    ]);

    const wrapper = el('div', { className: 'login' }, [card]);

    async function initSetup() {
        content.replaceChildren(notice('info', 'Inizializzazione configurazione MFA…'));

        const outcome = await api.post('/api/account/mfa/setup', {})
            .then((res) => ({ ok: true, data: res }))
            .catch((err) => ({ ok: false, error: err }));

        if (!outcome.ok) {
            content.replaceChildren(
                notice('error', `Errore inizializzazione: ${outcome.error.message}`)
            );
            return;
        }

        const { secret, uri } = outcome.data;
        showVerificationForm(secret, uri);
    }

    function showVerificationForm(secret, uri) {
        const codeInput = el('input', {
            className: 'input',
            type: 'text',
            inputMode: 'numeric',
            autocomplete: 'one-time-code',
            placeholder: '123456',
            required: 'required',
            maxLength: '6'
        });

        const verifyButton = el('button', {
            className: 'btn btn--primary',
            type: 'submit',
            textContent: 'Verifica e attiva'
        });

        const qrContainer = el('div', { className: 'qr-wrap' }, [renderQrSvg(uri, { size: 160 })]);
        const secretBox = el('div', { className: 'mfa-secret-box' }, [
            el('span', { className: 'mfa-secret-label', textContent: 'Chiave manuale' }),
            el('code', { className: 'mfa-secret-val', textContent: secret })
        ]);
        const qrPane = el('div', { className: 'mfa-qr-pane' }, [
            qrContainer,
            secretBox
        ]);

        const actionPane = el('div', { className: 'mfa-action-pane' }, [
            el('p', { className: 'mfa-step' }, [
                el('strong', { textContent: '1. ' }),
                'Scansiona con Google Authenticator, Aegis o Bitwarden:'
            ]),
            el('p', { className: 'mfa-step' }, [
                el('strong', { textContent: '2. ' }),
                'Inserisci il codice di verifica a 6 cifre:'
            ]),
            field('Codice TOTP', codeInput),
            feedback,
            verifyButton
        ]);

        const form = el('form', {
            className: 'mfa-grid',
            onsubmit: async (event) => {
                event.preventDefault();
                feedback.replaceChildren();
                verifyButton.disabled = true;
                verifyButton.textContent = 'Verifica in corso…';

                const confirmOutcome = await api.post('/api/account/mfa/confirm', { code: codeInput.value.trim() })
                    .then((res) => ({ ok: true, data: res }))
                    .catch((err) => ({ ok: false, error: err }));

                verifyButton.disabled = false;
                verifyButton.textContent = 'Verifica e attiva';

                if (!confirmOutcome.ok) {
                    feedback.replaceChildren(notice('error', confirmOutcome.error.message || 'Codice non valido'));
                    codeInput.value = '';
                    codeInput.focus();
                    return;
                }

                showRecoveryCodes(confirmOutcome.data.recoveryCodes);
            }
        }, [qrPane, actionPane]);

        content.replaceChildren(form);
        queueMicrotask(() => codeInput.focus());
    }

    function showRecoveryCodes(recoveryCodes) {
        const codeChips = recoveryCodes.map((code) => el('code', { className: 'mfa-secret-val', textContent: code }));
        const codeGrid = el('div', { className: 'mfa-codes-grid' }, codeChips);

        const proceedBtn = el('button', {
            className: 'btn btn--primary',
            type: 'button',
            textContent: 'Ho conservato i codici, continua',
            onclick: () => onComplete()
        });

        content.replaceChildren(
            el('h2', { className: 'view__title', textContent: 'Codici di recupero' }),
            notice('warn', 'Salva questi 10 codici di emergenza in un luogo sicuro. Ognuno puo essere utilizzato una sola volta se perdi l accesso all app di autenticazione. Non verranno piu mostrati.'),
            codeGrid,
            el('div', { className: 'stack' }, [proceedBtn])
        );
    }

    initSetup();
    return wrapper;
}
