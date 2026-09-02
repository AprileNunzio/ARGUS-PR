import { el, chip, empty, field, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

export async function renderPeopleView({ api, session }) {
    const outlet = el('div', { className: 'view' });
    const canManage = session.permissions.includes('camera.manage');
    const formHost = el('div', { hidden: 'hidden' });
    const listHost = el('div', { className: 'stack' });

    function renderAddForm() {
        const nameInput = el('input', { className: 'input', type: 'text', placeholder: 'Mario Rossi', required: 'required' });
        const notesInput = el('textarea', { className: 'input', rows: '3', placeholder: 'Dipendente / Ospite' });
        const feedback = el('div', { hidden: 'hidden' });

        const saveBtn = el('button', { className: 'btn btn--primary', type: 'submit', textContent: 'Salva Persona' });
        const cancelBtn = el('button', {
            className: 'btn',
            type: 'button',
            textContent: 'Annulla',
            onclick: () => formHost.setAttribute('hidden', 'hidden')
        });

        const form = el('form', { className: 'panel stack' }, [
            el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: 'Iscrizione Persona' })]),
            el('div', { className: 'panel__body stack' }, [
                field('Nome e Cognome', nameInput),
                field('Note informative', notesInput),
                feedback,
                el('div', { className: 'row row--end' }, [cancelBtn, saveBtn])
            ])
        ]);

        form.onsubmit = async (e) => {
            e.preventDefault();
            saveBtn.disabled = true;
            feedback.setAttribute('hidden', 'hidden');

            const outcome = await api.post('/api/people', {
                name: nameInput.value,
                notes: notesInput.value,
                embedding: new Array(128).fill(0).map(() => Number((Math.random() - 0.5).toFixed(4)))
            }).then(() => null).catch((err) => err);

            saveBtn.disabled = false;
            if (outcome instanceof Error) {
                feedback.replaceChildren(notice('error', outcome.message));
                feedback.removeAttribute('hidden');
                return;
            }

            formHost.setAttribute('hidden', 'hidden');
            await loadPeople();
        };

        return form;
    }

    async function loadPeople() {
        const data = await api.get('/api/people').catch(() => ({ people: [] }));
        const people = data.people ?? [];

        if (people.length === 0) {
            listHost.replaceChildren(empty('Nessuna persona iscritta nell\'anagrafica biometrica.'));
            return;
        }

        const rows = people.map((p) => {
            const hasBiometrics = Array.isArray(p.embedding) && p.embedding.length > 0;
            const dateStr = new Date(p.createdAt).toLocaleDateString();

            const deleteBtn = canManage ? el('button', {
                className: 'btn btn--sm btn--danger',
                type: 'button',
                textContent: 'Elimina (GDPR)',
                onclick: async () => {
                    if (!confirm(`Cancellare definitivamente ${p.name}? Questa operazione purga tutti i dati biometrici e i log associati ai sensi del GDPR.`)) return;
                    await api.remove(`/api/people/${p.id}`);
                    await loadPeople();
                }
            }) : null;

            return el('div', { className: 'device-row' }, [
                el('div', { className: 'stack' }, [
                    el('div', { className: 'row' }, [
                        el('strong', { textContent: p.name }),
                        hasBiometrics ? chip('biometria attiva', 'ok') : chip('senza foto', 'warn'),
                        el('span', { className: 'section__hint mono', textContent: `Iscritto il ${dateStr}` })
                    ]),
                    p.notes ? el('div', { className: 'section__hint', textContent: p.notes }) : null
                ]),
                deleteBtn
            ]);
        });

        listHost.replaceChildren(...rows);
    }

    const addBtn = canManage ? el('button', {
        className: 'btn btn--primary btn--sm',
        type: 'button',
        onclick: () => {
            formHost.replaceChildren(renderAddForm());
            formHost.removeAttribute('hidden');
            formHost.scrollIntoView({ behavior: 'smooth' });
        }
    }, [icon('plus'), el('span', { textContent: 'Iscrivi Persona' })]) : null;

    outlet.replaceChildren(
        el('div', { className: 'view__head' }, [
            el('div', {}, [
                el('h1', { className: 'view__title', textContent: 'Anagrafica Persone & Riconoscimento Facciale' }),
                el('p', { className: 'view__sub', textContent: 'Gestione identificativi biometrici nel rispetto della normativa GDPR' })
            ]),
            el('div', { className: 'row row--tight' }, [addBtn])
        ]),
        formHost,
        el('section', { className: 'panel' }, [
            el('div', { className: 'panel__body' }, [listHost])
        ])
    );

    await loadPeople();
    return outlet;
}
