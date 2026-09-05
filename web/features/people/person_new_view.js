import { el, chip, field, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { go } from '/assets/router.js';
import { createFace3DCanvas, renderBiometricBadge } from './people_face3d.js';

export async function renderNewPersonView({ api, session }) {
    const outlet = el('div', { className: 'view' });

    const backBtn = el('button', {
        className: 'page-back',
        type: 'button',
        onclick: () => go('people')
    }, [icon('chevron-left'), el('span', { textContent: 'Torna al Catalogo' })]);

    const headerHost = el('div', { className: 'view__head' });
    const bodyHost = el('div', { className: 'stack' });

    headerHost.replaceChildren(
        el('div', { className: 'stack stack--tight' }, [
            backBtn,
            el('h1', { className: 'view__title', textContent: 'Iscrizione Biometrica HD' }),
            el('span', { className: 'section__hint', textContent: 'Acquisizione del volto in alta definizione e mapping dei punti facciali.' })
        ])
    );

    const nameInput = el('input', { className: 'input input--lg', type: 'text', placeholder: 'Mario Rossi', required: 'required', style: 'font-size: 1.25rem; font-weight: 500;' });
    const departmentInput = el('input', { className: 'input', type: 'text', placeholder: 'Sicurezza, IT, Logistica...' });
    
    const roleSelect = el('select', { className: 'input select' }, [
        el('option', { value: 'dipendente', textContent: 'Dipendente (Standard)' }),
        el('option', { value: 'responsabile', textContent: 'Responsabile / Direzione' }),
        el('option', { value: 'visitatore', textContent: 'Visitatore Temporaneo' }),
        el('option', { value: 'fornitore', textContent: 'Fornitore / Manutentore' }),
        el('option', { value: 'speciale', textContent: 'VIP / Permesso Speciale' })
    ]);

    const permVarchi = el('input', { type: 'checkbox', value: 'varchi' });
    const permH24 = el('input', { type: 'checkbox', value: 'h24' });
    const permVip = el('input', { type: 'checkbox', value: 'vip' });
    const permAllarme = el('input', { type: 'checkbox', value: 'allarme_silenzioso' });

    const permsContainer = el('div', { className: 'row row--wrap row--tight' }, [
        el('label', { className: 'row row--tight' }, [permVarchi, el('span', { textContent: 'Accesso Varchi' })]),
        el('label', { className: 'row row--tight' }, [permH24, el('span', { textContent: 'Transito H24' })]),
        el('label', { className: 'row row--tight' }, [permVip, el('span', { textContent: 'Accesso VIP' })]),
        el('label', { className: 'row row--tight' }, [permAllarme, el('span', { textContent: 'Allerta Silenziosa' })])
    ]);

    const notesInput = el('textarea', { className: 'input', rows: '4', placeholder: 'Note operative, badge n. 1234, mansioni...' });
    const fileInput = el('input', { className: 'input', type: 'file', accept: 'image/*' });

    let extractedEmbedding = [];
    let thumbnailData = null;
    let face3dParams = {};
    const galleryPhotos = [];

    const previewImg = el('img', { className: 'nerd-face-img' });
    const canvas3DHost = el('div', { className: 'nerd-canvas-host' });
    const statusBadge = el('div', { className: 'section__hint', textContent: 'Seleziona una foto chiara in HD per estrarre il vettore 128-D e la posa 3D.' });
    
    const previewContainer = el('div', { className: 'nerd-preview-container' }, [
        previewImg, 
        canvas3DHost,
        el('div', { className: 'nerd-overlay-scanline' })
    ]);

    const feedback = el('div', { hidden: 'hidden' });
    const saveBtn = el('button', { className: 'btn btn--primary btn--lg', type: 'submit', textContent: 'Registra Profilo nel Database' });

    async function extractFromBase64(base64) {
        statusBadge.textContent = 'Analisi biometrica e calcolo 3D in corso (YuNet + SFace)...';
        statusBadge.className = 'section__hint mono pulse-text';
        feedback.setAttribute('hidden', 'hidden');
        previewImg.src = base64;
        previewImg.classList.add('nerd-face-img--active');

        try {
            const res = await api.post('/api/people/extract-face', { imageBase64: base64 });
            if (res && res.ok) {
                extractedEmbedding = res.embedding;
                thumbnailData = res.thumbnail || base64;
                face3dParams = res.pose3d || { yaw: 0, pitch: 0, roll: 0, pose: 'front' };
                if (res.thumbnail) previewImg.src = res.thumbnail;

                statusBadge.className = 'section__hint mono';
                canvas3DHost.replaceChildren(createFace3DCanvas(face3dParams, 300, 300));

                statusBadge.replaceChildren(
                    chip('Vettore 128-D Estratto', 'ok'),
                    renderBiometricBadge(face3dParams),
                    el('span', { className: 'chip chip--info mono', textContent: `Confidenza: ${Math.round(res.confidence * 100)}%` }),
                    el('span', { className: 'chip chip--violet mono', textContent: 'HD Scan Completo' })
                );

                if (galleryPhotos.length < 3) {
                    galleryPhotos.push(thumbnailData);
                }
            } else {
                throw new Error(res?.error || 'Nessun volto valido trovato nella foto');
            }
        } catch (err) {
            previewImg.classList.remove('nerd-face-img--active');
            previewImg.classList.add('nerd-face-img--warn');
            canvas3DHost.replaceChildren();
            statusBadge.className = 'section__hint';
            statusBadge.replaceChildren(
                chip('Nessun volto riconosciuto', 'warn'),
                el('span', { className: 'section__hint', textContent: err.message || 'Prova con una foto più ravvicinata e luminosa' })
            );
            extractedEmbedding = [];
            thumbnailData = null;
            face3dParams = {};
        }
    }

    fileInput.onchange = () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => extractFromBase64(e.target.result);
        reader.readAsDataURL(file);
    };

    const initialBase64 = sessionStorage.getItem('argus_new_person_base64');
    if (initialBase64) {
        sessionStorage.removeItem('argus_new_person_base64');
        if (initialBase64.startsWith('data:')) {
            extractFromBase64(initialBase64);
        } else {
            fetch(initialBase64)
                .then(res => res.blob())
                .then(blob => {
                    const reader = new FileReader();
                    reader.onload = (e) => extractFromBase64(e.target.result);
                    reader.readAsDataURL(blob);
                })
                .catch(() => notice('error', 'Impossibile precaricare la foto.'));
        }
    }

    const form = el('form', { className: 'stack' }, [
        el('div', { className: 'details-layout', style: 'margin-top: 1rem;' }, [
            el('div', { className: 'panel stack details-main' }, [
                el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title mono', textContent: 'Dati Anagrafici & Permessi' })]),
                el('div', { className: 'panel__body stack' }, [
                    field('Nome e Cognome Completo', nameInput),
                    field('Ruolo nel Sistema', roleSelect),
                    field('Reparto / Dipartimento', departmentInput),
                    field('Privilegi Speciali', permsContainer),
                    field('Note (Visibili solo ad Admin)', notesInput)
                ])
            ]),
            el('div', { className: 'panel stack details-side', style: 'flex: 1.5; min-width: 400px; background: var(--surface-2);' }, [
                el('div', { className: 'panel__head' }, [
                    el('span', { className: 'panel__title mono', textContent: 'Scanner Biometrico HD' }),
                    el('label', { className: 'btn btn--sm btn--ghost cursor-pointer', style: 'margin-left: auto;' }, [
                        icon('upload'), el('span', { textContent: 'Carica Immagine' }),
                        el('input', { type: 'file', accept: 'image/*', style: 'display: none;', onchange: fileInput.onchange })
                    ])
                ]),
                el('div', { className: 'panel__body stack row--center', style: 'justify-content: center; align-items: center;' }, [
                    previewContainer,
                    el('div', { className: 'row row--center', style: 'margin-top: 1rem;' }, [statusBadge])
                ])
            ])
        ]),
        feedback,
        el('div', { className: 'row row--end', style: 'margin-top: 1rem;' }, [saveBtn])
    ]);

    form.onsubmit = async (e) => {
        e.preventDefault();
        saveBtn.disabled = true;
        feedback.setAttribute('hidden', 'hidden');

        const activePerms = [];
        if (permVarchi.checked) activePerms.push('varchi');
        if (permH24.checked) activePerms.push('h24');
        if (permVip.checked) activePerms.push('vip');
        if (permAllarme.checked) activePerms.push('allarme_silenzioso');

        const outcome = await api.post('/api/people', {
            name: nameInput.value,
            role: roleSelect.value,
            department: departmentInput.value,
            specialPermissions: activePerms,
            face3dParams,
            gallery: galleryPhotos.slice(0, 3),
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

        go('people'); // back to catalog on success
    };

    bodyHost.replaceChildren(form);
    outlet.append(headerHost, bodyHost);
    return outlet;
}
