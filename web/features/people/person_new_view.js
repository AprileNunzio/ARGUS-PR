import { el, chip, field, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { go } from '/assets/router.js';
import { createFace3DCanvas, renderBiometricBadge } from './people_face3d.js';

const ROLE_OPTIONS = [
    ['dipendente', 'Dipendente (standard)'],
    ['responsabile', 'Responsabile / direzione'],
    ['visitatore', 'Visitatore temporaneo'],
    ['fornitore', 'Fornitore / manutentore'],
    ['speciale', 'VIP / permesso speciale']
];

const PERMISSION_OPTIONS = [
    ['varchi', 'Accesso varchi'],
    ['h24', 'Transito H24'],
    ['vip', 'Accesso VIP'],
    ['allarme_silenzioso', 'Allerta silenziosa']
];

export async function renderNewPersonView({ api, session }) {
    const outlet = el('div', { className: 'view' });

    const backBtn = el('button', {
        className: 'page-back',
        type: 'button',
        onclick: () => go('people')
    }, [icon('chevronLeft'), el('span', { textContent: 'Torna al catalogo' })]);

    const nameInput = el('input', { className: 'input input--lg', type: 'text', placeholder: 'Mario Rossi', required: 'required' });
    const departmentInput = el('input', { className: 'input', type: 'text', placeholder: 'Sicurezza, IT, Logistica…' });
    const roleSelect = el('select', { className: 'input select' }, ROLE_OPTIONS.map(([value, label]) => (
        el('option', { value, textContent: label })
    )));

    const permissionInputs = PERMISSION_OPTIONS.map(([value, label]) => {
        const input = el('input', { type: 'checkbox', value });
        return { value, input, node: el('label', { className: 'row row--tight' }, [input, el('span', { textContent: label })]) };
    });

    const notesInput = el('textarea', { className: 'input', rows: '4', placeholder: 'Note operative, badge n. 1234, mansioni…' });

    let extractedEmbedding = [];
    let thumbnailData = null;
    let face3dParams = {};
    const galleryPhotos = [];

    const previewImg = el('img', { className: 'nerd-face-img', alt: '' });
    const canvas3DHost = el('div', { className: 'nerd-canvas-host' });
    const statusBadge = el('div', { className: 'section__hint', textContent: 'Carica una foto frontale e nitida: da lì estraiamo il vettore 128-D e la posa 3D.' });

    const previewContainer = el('div', { className: 'nerd-preview-container' }, [
        previewImg,
        canvas3DHost,
        el('div', { className: 'nerd-overlay-scanline' })
    ]);

    const feedback = el('div', { hidden: 'hidden' });
    const saveBtn = el('button', { className: 'btn btn--primary btn--lg', type: 'submit', textContent: 'Registra profilo nel database' });

    function applyBiometrics({ embedding, thumbnail, pose3d, confidence, source }) {
        extractedEmbedding = embedding;
        thumbnailData = thumbnail;
        face3dParams = pose3d ?? { yaw: 0, pitch: 0, roll: 0, pose: 'front' };

        if (thumbnail) previewImg.src = thumbnail;
        previewImg.classList.remove('nerd-face-img--warn');
        previewImg.classList.add('nerd-face-img--active');

        canvas3DHost.replaceChildren(createFace3DCanvas(face3dParams, 300, 300));
        statusBadge.className = 'section__hint mono';
        statusBadge.replaceChildren(
            chip(`Vettore ${embedding.length}-D estratto`, 'ok'),
            renderBiometricBadge(face3dParams),
            confidence === null ? null : el('span', { className: 'chip chip--info mono', textContent: `Confidenza: ${Math.round(confidence * 100)}%` }),
            el('span', { className: 'chip chip--violet mono', textContent: source })
        );

        if (thumbnail && galleryPhotos.length < 3 && !galleryPhotos.includes(thumbnail)) {
            galleryPhotos.push(thumbnail);
        }
    }

    function reportFailure(message) {
        previewImg.classList.remove('nerd-face-img--active');
        previewImg.classList.add('nerd-face-img--warn');
        canvas3DHost.replaceChildren();
        statusBadge.className = 'section__hint';
        statusBadge.replaceChildren(
            chip('Nessun volto riconosciuto', 'warn'),
            el('span', { className: 'section__hint', textContent: message })
        );
        extractedEmbedding = [];
        thumbnailData = null;
        face3dParams = {};
    }

    async function extractFromBase64(base64) {
        statusBadge.textContent = 'Analisi biometrica e calcolo 3D in corso (YuNet + SFace)…';
        statusBadge.className = 'section__hint mono pulse-text';
        feedback.setAttribute('hidden', 'hidden');
        previewImg.src = base64;
        previewImg.classList.add('nerd-face-img--active');

        const outcome = await api.post('/api/people/extract-face', { imageBase64: base64 })
            .then((value) => ({ value }))
            .catch((error) => ({ error }));

        if (outcome.error) {
            reportFailure(outcome.error.message);
            return;
        }

        applyBiometrics({
            embedding: outcome.value.embedding,
            thumbnail: outcome.value.thumbnail ?? base64,
            pose3d: outcome.value.pose3d,
            confidence: outcome.value.confidence ?? null,
            source: 'Scansione HD'
        });
    }

    function handleFileChange(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (loaded) => extractFromBase64(loaded.target.result);
        reader.readAsDataURL(file);
    }

    const uploadInput = el('input', { className: 'input--file', type: 'file', accept: 'image/*', onchange: handleFileChange });

    async function preloadFromTransit(logId, base64) {
        const outcome = await api.get(`/api/people/logs/${logId}`)
            .then((value) => ({ value }))
            .catch((error) => ({ error }));

        const log = outcome.value?.faceLog ?? null;
        if (log && Array.isArray(log.embedding) && log.embedding.length > 0) {
            applyBiometrics({
                embedding: log.embedding,
                thumbnail: log.snapshotPath ?? base64,
                pose3d: log.pose3d,
                confidence: log.confidence ?? null,
                source: 'Vettore dal transito'
            });
            return;
        }
        await extractFromBase64(base64);
    }

    const initialBase64 = sessionStorage.getItem('argus_new_person_base64');
    const initialLogId = sessionStorage.getItem('argus_new_person_log');
    sessionStorage.removeItem('argus_new_person_base64');
    sessionStorage.removeItem('argus_new_person_log');

    if (initialBase64 && initialBase64.startsWith('data:')) {
        if (initialLogId) {
            preloadFromTransit(initialLogId, initialBase64);
        } else {
            extractFromBase64(initialBase64);
        }
    }

    const form = el('form', { className: 'stack' }, [
        el('div', { className: 'details-layout' }, [
            el('div', { className: 'panel stack details-main' }, [
                el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title mono', textContent: 'Dati anagrafici e permessi' })]),
                el('div', { className: 'panel__body stack' }, [
                    field('Nome e cognome completo', nameInput),
                    field('Ruolo nel sistema', roleSelect),
                    field('Reparto / dipartimento', departmentInput),
                    field('Privilegi speciali', el('div', { className: 'row row--wrap row--tight' }, permissionInputs.map((entry) => entry.node))),
                    field('Note (visibili solo ad admin)', notesInput)
                ])
            ]),
            el('div', { className: 'panel stack details-side details-side--scanner' }, [
                el('div', { className: 'panel__head' }, [
                    el('span', { className: 'panel__title mono', textContent: 'Scanner biometrico HD' }),
                    el('label', { className: 'btn btn--sm btn--ghost cursor-pointer panel__head-action' }, [
                        icon('download'),
                        el('span', { textContent: 'Carica immagine' }),
                        uploadInput
                    ])
                ]),
                el('div', { className: 'panel__body stack stack--tight scanner-body' }, [
                    previewContainer,
                    statusBadge
                ])
            ])
        ]),
        feedback,
        el('div', { className: 'row row--end' }, [saveBtn])
    ]);

    form.onsubmit = async (event) => {
        event.preventDefault();
        saveBtn.disabled = true;
        feedback.setAttribute('hidden', 'hidden');

        if (extractedEmbedding.length === 0) {
            feedback.replaceChildren(notice('warn', 'Senza vettore biometrico il profilo non verrà mai riconosciuto dalle telecamere: carica una foto valida prima di salvare.'));
            feedback.removeAttribute('hidden');
            saveBtn.disabled = false;
            return;
        }

        const outcome = await api.post('/api/people', {
            name: nameInput.value,
            role: roleSelect.value,
            department: departmentInput.value,
            specialPermissions: permissionInputs.filter((entry) => entry.input.checked).map((entry) => entry.value),
            face3dParams,
            gallery: galleryPhotos.slice(0, 3),
            notes: notesInput.value,
            embedding: extractedEmbedding,
            photoPath: thumbnailData
        }).then(() => null).catch((error) => error);

        saveBtn.disabled = false;
        if (outcome) {
            feedback.replaceChildren(notice('error', outcome.message));
            feedback.removeAttribute('hidden');
            return;
        }

        go('people');
    };

    outlet.append(
        el('div', { className: 'view__head' }, [
            el('div', { className: 'stack stack--tight' }, [
                backBtn,
                el('h1', { className: 'view__title', textContent: 'Iscrizione biometrica HD' }),
                el('span', { className: 'section__hint', textContent: 'Acquisizione del volto in alta definizione e mapping dei punti facciali.' })
            ])
        ]),
        el('div', { className: 'stack' }, [form])
    );

    return outlet;
}
