import { el, chip, field, notice } from '/assets/dom.js';
import { createFace3DCanvas, renderBiometricBadge } from './people_face3d.js';

export function renderAddPersonForm({ api, initialImageBase64, onSaved, onCancel }) {
    const nameInput = el('input', { className: 'input', type: 'text', placeholder: 'Mario Rossi', required: 'required' });
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

    const notesInput = el('textarea', { className: 'input', rows: '2', placeholder: 'Note operative, badge n. 1234, mansioni...' });
    const fileInput = el('input', { className: 'input', type: 'file', accept: 'image/*' });

    let extractedEmbedding = [];
    let thumbnailData = null;
    let face3dParams = {};
    const galleryPhotos = [];

    const previewImg = el('img', { className: 'avatar-preview' });
    const canvas3DHost = el('div', { className: 'face3d-host' });
    const statusBadge = el('div', { className: 'section__hint', textContent: 'Seleziona una foto chiara per estrarre il vettore 128-D e il modello 3D.' });
    const previewContainer = el('div', { className: 'row row--tight' }, [previewImg, canvas3DHost, statusBadge]);

    const feedback = el('div', { hidden: 'hidden' });
    const saveBtn = el('button', { className: 'btn btn--primary', type: 'submit', textContent: 'Salva Persona nel Catalogo' });
    const cancelBtn = el('button', {
        className: 'btn',
        type: 'button',
        textContent: 'Annulla',
        onclick: onCancel
    });

    async function extractFromBase64(base64) {
        statusBadge.textContent = 'Analisi biometrica e calcolo 3D in corso (YuNet + SFace)...';
        statusBadge.className = 'section__hint mono';
        feedback.setAttribute('hidden', 'hidden');
        previewImg.src = base64;
        previewImg.className = 'avatar-preview avatar-preview--active';

        try {
            const res = await api.post('/api/people/extract-face', { imageBase64: base64 });
            if (res && res.ok) {
                extractedEmbedding = res.embedding;
                thumbnailData = res.thumbnail || base64;
                face3dParams = res.pose3d || { yaw: 0, pitch: 0, roll: 0, pose: 'front' };
                if (res.thumbnail) previewImg.src = res.thumbnail;

                canvas3DHost.replaceChildren(createFace3DCanvas(face3dParams, 120, 120));

                statusBadge.replaceChildren(
                    chip('Volto Codificato 128-D', 'ok'),
                    renderBiometricBadge(face3dParams),
                    el('span', { className: 'section__hint mono', textContent: `Confidenza: ${Math.round(res.confidence * 100)}%` })
                );

                if (galleryPhotos.length < 3) {
                    galleryPhotos.push(thumbnailData);
                }
            } else {
                throw new Error(res?.error || 'Nessun volto valido trovato nella foto');
            }
        } catch (err) {
            previewImg.className = 'avatar-preview avatar-preview--warn';
            canvas3DHost.replaceChildren();
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

    if (initialImageBase64) {
        extractFromBase64(initialImageBase64);
    }

    const form = el('form', { className: 'panel stack' }, [
        el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: 'Iscrizione Persona nel Catalogo' })]),
        el('div', { className: 'panel__body stack' }, [
            el('div', { className: 'row' }, [
                field('Nome e Cognome', nameInput),
                field('Ruolo nel Sistema', roleSelect)
            ]),
            el('div', { className: 'row' }, [
                field('Reparto / Dipartimento', departmentInput),
                field('Permessi Speciali', permsContainer)
            ]),
            field('Fotografia del Volto (Estrazione Biometrica & 3D)', fileInput),
            previewContainer,
            field('Note aggiuntive & Riferimenti', notesInput),
            feedback,
            el('div', { className: 'row row--end' }, [cancelBtn, saveBtn])
        ])
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

        if (onSaved) onSaved();
    };

    return form;
}
