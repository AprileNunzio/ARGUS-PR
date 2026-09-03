import { el, chip, empty, field, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

export async function renderPeopleView({ api, session }) {
    const outlet = el('div', { className: 'view' });
    const canManage = session.permissions.includes('camera.manage');
    let currentTab = 'people';

    const formHost = el('div', { hidden: 'hidden' });
    const listHost = el('div', { className: 'stack' });
    const logsHost = el('div', { className: 'stack' });

    function renderAddForm() {
        const nameInput = el('input', { className: 'input', type: 'text', placeholder: 'Mario Rossi', required: 'required' });
        const notesInput = el('textarea', { className: 'input', rows: '2', placeholder: 'Dipendente, Responsabile, Visitatore' });
        const fileInput = el('input', { className: 'input', type: 'file', accept: 'image/*' });
        
        let extractedEmbedding = [];
        let thumbnailData = null;

        const previewContainer = el('div', { className: 'row row--tight' });
        const previewImg = el('img', { className: 'avatar-preview' });
        const statusBadge = el('div', { className: 'section__hint', textContent: 'Seleziona una foto frontale chiara per estrarre la biometria facciale.' });
        previewContainer.append(previewImg, statusBadge);

        const feedback = el('div', { hidden: 'hidden' });
        const saveBtn = el('button', { className: 'btn btn--primary', type: 'submit', textContent: 'Salva Persona' });
        const cancelBtn = el('button', {
            className: 'btn',
            type: 'button',
            textContent: 'Annulla',
            onclick: () => formHost.setAttribute('hidden', 'hidden')
        });

        fileInput.onchange = async () => {
            const file = fileInput.files?.[0];
            if (!file) return;

            statusBadge.textContent = 'Analisi biometrica in corso (YuNet + SFace)...';
            statusBadge.className = 'section__hint mono';
            feedback.setAttribute('hidden', 'hidden');

            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64 = e.target.result;
                previewImg.src = base64;
                previewImg.className = 'avatar-preview avatar-preview--active';

                try {
                    const res = await api.post('/api/people/extract-face', { imageBase64: base64 });
                    if (res && res.ok) {
                        extractedEmbedding = res.embedding;
                        thumbnailData = res.thumbnail || base64;
                        if (res.thumbnail) previewImg.src = res.thumbnail;
                        previewImg.className = 'avatar-preview avatar-preview--active';
                        statusBadge.replaceChildren(
                            chip('Volto Rilevato & Codificato', 'ok'),
                            el('span', { className: 'section__hint mono', textContent: `Confidenza: ${Math.round(res.confidence * 100)}% (128-D SFace)` })
                        );
                    } else {
                        throw new Error(res?.error || 'Nessun volto valido trovato nella foto');
                    }
                } catch (err) {
                    previewImg.className = 'avatar-preview avatar-preview--warn';
                    statusBadge.replaceChildren(
                        chip('Nessun volto riconosciuto', 'warn'),
                        el('span', { className: 'section__hint', textContent: err.message || 'Prova con una foto più ravvicinata e luminosa' })
                    );
                    extractedEmbedding = [];
                    thumbnailData = null;
                }
            };
            reader.readAsDataURL(file);
        };

        const form = el('form', { className: 'panel stack' }, [
            el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: 'Iscrizione Biometrica Persona' })]),
            el('div', { className: 'panel__body stack' }, [
                field('Nome e Cognome', nameInput),
                field('Fotografia del Volto (Estrazione Biometrica)', fileInput),
                previewContainer,
                field('Note informative / Ruolo', notesInput),
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
                embedding: extractedEmbedding,
                photoPath: thumbnailData
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

            const avatarEl = p.photoPath 
                ? el('img', { src: p.photoPath, className: 'avatar-thumb' })
                : el('div', { className: 'avatar-thumb--empty' }, [icon('user')]);

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
                avatarEl,
                el('div', { className: 'stack' }, [
                    el('div', { className: 'row' }, [
                        el('strong', { textContent: p.name }),
                        hasBiometrics ? chip('biometria 128-D', 'ok') : chip('senza foto', 'warn'),
                        el('span', { className: 'section__hint mono', textContent: `Iscritto il ${dateStr}` })
                    ]),
                    p.notes ? el('div', { className: 'section__hint', textContent: p.notes }) : null
                ]),
                deleteBtn
            ]);
        });

        listHost.replaceChildren(...rows);
    }

    async function loadLogs() {
        const data = await api.get('/api/people/logs/faces?limit=50').catch(() => ({ faceLogs: [] }));
        const logs = data.faceLogs ?? [];

        if (logs.length === 0) {
            logsHost.replaceChildren(empty('Nessun transito facciale recente registrato dalle telecamere.'));
            return;
        }

        const peopleData = await api.get('/api/people').catch(() => ({ people: [] }));
        const peopleMap = new Map((peopleData.people ?? []).map(p => [p.id, p]));

        const rows = logs.map((log) => {
            const person = log.personId ? peopleMap.get(log.personId) : null;
            const dateStr = new Date(log.createdAt).toLocaleString();
            const confPct = `${Math.round((log.confidence ?? 0) * 100)}%`;

            return el('div', { className: 'device-row' }, [
                el('div', { className: 'stack' }, [
                    el('div', { className: 'row' }, [
                        person ? chip(person.name, 'ok') : chip('Sconosciuto', 'info'),
                        el('strong', { textContent: `Telecamera: ${log.cameraId}` }),
                        el('span', { className: 'section__hint mono', textContent: dateStr })
                    ]),
                    el('div', { className: 'row' }, [
                        el('span', { className: 'section__hint', textContent: `Confidenza: ${confPct}` }),
                        log.box ? el('span', { className: 'section__hint mono', textContent: `Box: [${log.box.map(b => Number(b).toFixed(2)).join(', ')}]` }) : null
                    ])
                ])
            ]);
        });

        logsHost.replaceChildren(...rows);
    }

    const tabPeopleBtn = el('button', {
        className: 'seg__btn seg__btn--on',
        type: 'button',
        textContent: 'Anagrafica',
        onclick: () => {
            currentTab = 'people';
            tabPeopleBtn.classList.add('seg__btn--on');
            tabLogsBtn.classList.remove('seg__btn--on');
            panelBody.replaceChildren(listHost);
            loadPeople();
        }
    });

    const tabLogsBtn = el('button', {
        className: 'seg__btn',
        type: 'button',
        textContent: 'Transiti',
        onclick: () => {
            currentTab = 'logs';
            tabLogsBtn.classList.add('seg__btn--on');
            tabPeopleBtn.classList.remove('seg__btn--on');
            panelBody.replaceChildren(logsHost);
            loadLogs();
        }
    });

    const addBtn = canManage ? el('button', {
        className: 'btn btn--primary btn--sm',
        type: 'button',
        onclick: () => {
            formHost.replaceChildren(renderAddForm());
            formHost.removeAttribute('hidden');
            formHost.scrollIntoView({ behavior: 'smooth' });
        }
    }, [icon('plus'), el('span', { textContent: 'Iscrivi' })]) : null;

    const panelBody = el('div', { className: 'panel__body' }, [listHost]);

    outlet.replaceChildren(
        el('div', { className: 'view__head' }, [
            el('h1', { className: 'view__title', textContent: 'Volti' }),
            el('div', { className: 'row row--tight' }, [addBtn])
        ]),
        el('div', { className: 'row schedule-presets' }, [tabPeopleBtn, tabLogsBtn]),
        formHost,
        el('section', { className: 'panel' }, [panelBody])
    );

    await loadPeople();
    return outlet;
}
