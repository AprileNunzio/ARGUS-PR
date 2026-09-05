import { el, chip, empty, notice, confirmPanel } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { renderAddPersonForm } from './people_form.js';
import { createFace3DCanvas, renderBiometricBadge } from './people_face3d.js';

const ROLE_CHIPS = {
    dipendente: { label: 'Dipendente', variant: 'ok' },
    responsabile: { label: 'Responsabile', variant: 'info' },
    visitatore: { label: 'Visitatore', variant: 'warn' },
    fornitore: { label: 'Fornitore', variant: 'warn' },
    speciale: { label: 'VIP / Speciale', variant: 'violet' }
};

export async function renderPeopleView({ api, session }) {
    const outlet = el('div', { className: 'view' });
    const canManage = session.permissions.includes('camera.manage');
    let currentTab = 'people';

    const formHost = el('div', { hidden: 'hidden' });
    const listHost = el('div', { className: 'stack' });
    const confirmHost = el('div', {});
    const logsHost = el('div', { className: 'stack' });

    function renderPersonCard(p) {
        const hasBiometrics = Array.isArray(p.embedding) && p.embedding.length > 0;
        const dateStr = new Date(p.createdAt).toLocaleDateString();
        const roleConfig = ROLE_CHIPS[p.role] ?? { label: p.role, variant: 'info' };

        const avatarEl = p.photoPath 
            ? el('img', { src: p.photoPath, className: 'avatar-thumb' })
            : el('div', { className: 'avatar-thumb--empty' }, [icon('user')]);

        const permChips = (p.specialPermissions ?? []).map(perm => {
            const labels = {
                varchi: 'Varchi',
                h24: 'H24',
                vip: 'VIP',
                allarme_silenzioso: 'Allarme'
            };
            return el('span', { className: 'chip chip--info mono', textContent: labels[perm] ?? perm });
        });

        const has3d = p.face3dParams && Object.keys(p.face3dParams).length > 0;
        let canvas3D = null;
        if (has3d) {
            canvas3D = el('div', { className: 'face3d-mini-host' }, [
                createFace3DCanvas(p.face3dParams, 90, 90)
            ]);
        }

        const galleryThumbs = (p.gallery ?? []).map((photo) => el('img', {
            src: photo,
            className: 'avatar-thumb avatar-thumb--sm'
        }));

        const deleteBtn = canManage ? el('button', {
            className: 'btn btn--sm btn--danger',
            type: 'button',
            textContent: 'Elimina (GDPR)',
            onclick: () => {
                confirmHost.replaceChildren(confirmPanel({
                    title: `Cancellare definitivamente ${p.name}?`,
                    message: 'Vengono purgati il profilo, i vettori biometrici e tutti i transiti registrati, ai sensi del GDPR. L operazione non e reversibile.',
                    confirmLabel: 'Cancella tutto',
                    onCancel: () => confirmHost.replaceChildren(),
                    onConfirm: async () => {
                        await api.remove(`/api/people/${p.id}`).catch(() => undefined);
                        confirmHost.replaceChildren();
                        await loadPeople();
                    }
                }));
                confirmHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }) : null;

        return el('div', { className: 'device-row row--space' }, [
            el('div', { className: 'row row--tight' }, [
                avatarEl,
                canvas3D,
                el('div', { className: 'stack' }, [
                    el('div', { className: 'row row--wrap row--tight' }, [
                        el('strong', { textContent: p.name }),
                        chip(roleConfig.label, roleConfig.variant),
                        p.department ? chip(p.department, 'info') : null,
                        hasBiometrics ? chip(`vettori: ${p.sampleCount || 1}`, 'ok') : chip('senza foto', 'warn'),
                        has3d ? renderBiometricBadge(p.face3dParams) : null
                    ]),
                    permChips.length > 0 ? el('div', { className: 'row row--wrap row--tight' }, permChips) : null,
                    p.notes ? el('div', { className: 'section__hint', textContent: p.notes }) : null,
                    galleryThumbs.length > 0 ? el('div', { className: 'row row--tight' }, galleryThumbs) : null,
                    el('span', { className: 'section__hint mono', textContent: `Iscritto il ${dateStr}` })
                ])
            ]),
            deleteBtn
        ]);
    }

    async function loadPeople() {
        const data = await api.get('/api/people').catch(() => ({ people: [] }));
        const people = data.people ?? [];

        if (people.length === 0) {
            listHost.replaceChildren(empty('Nessuna persona iscritta nell\'anagrafica biometrica.'));
            return;
        }

        listHost.replaceChildren(...people.map(renderPersonCard));
    }

    async function loadLogs() {
        const data = await api.get('/api/people/logs/faces?limit=50').catch(() => ({ faceLogs: [] }));
        const logs = data.faceLogs ?? [];

        if (logs.length === 0) {
            logsHost.replaceChildren(empty('Nessun transito facciale recente registrato dalle telecamere.'));
            return;
        }

        const peopleData = await api.get('/api/people').catch(() => ({ people: [] }));
        const peopleList = peopleData.people ?? [];
        const peopleMap = new Map(peopleList.map(p => [p.id, p]));

        const rows = logs.map((log) => {
            const person = log.personId ? peopleMap.get(log.personId) : null;
            const dateStr = new Date(log.createdAt).toLocaleString();
            const confPct = `${Math.round((log.confidence ?? 0) * 100)}%`;

            let personBadge = chip('Sconosciuto', 'warn');
            if (person) {
                const roleConfig = ROLE_CHIPS[person.role] ?? { label: person.role, variant: 'ok' };
                personBadge = chip(`${person.name} (${roleConfig.label})`, roleConfig.variant);
            }

            const correctBtn = canManage ? el('button', {
                className: 'btn btn--sm btn--ghost',
                type: 'button',
                textContent: 'Correggi Riconoscimento',
                onclick: () => {
                    const selectPerson = el('select', { className: 'input select' }, [
                        el('option', { value: '', textContent: '– Segna come Sconosciuto –' }),
                        ...peopleList.map(p => el('option', {
                            value: p.id,
                            textContent: `${p.name} (${p.role})`,
                            selected: p.id === log.personId ? 'selected' : undefined
                        }))
                    ]);

                    confirmHost.replaceChildren(confirmPanel({
                        title: 'Correzione Forense Transito Volto',
                        message: 'Seleziona la persona reale corretta per questo transito. Il sistema aggiornerà il log di audit.',
                        body: selectPerson,
                        confirmLabel: 'Salva Correzione',
                        onCancel: () => confirmHost.replaceChildren(),
                        onConfirm: async () => {
                            const newId = selectPerson.value || null;
                            await api.post(`/api/people/logs/${log.id}/correct`, { personId: newId }).catch(() => undefined);
                            confirmHost.replaceChildren();
                            await loadLogs();
                        }
                    }));
                    confirmHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }) : null;

            const addPersonBtn = (!person && canManage && log.snapshotPath) ? el('button', {
                className: 'btn btn--sm btn--primary',
                type: 'button',
                textContent: 'Crea Nuova Persona',
                onclick: async () => {
                    try {
                        const response = await fetch(log.snapshotPath);
                        const blob = await response.blob();
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            formHost.replaceChildren(renderAddPersonForm({
                                api,
                                initialImageBase64: e.target.result,
                                onSaved: async () => {
                                    formHost.setAttribute('hidden', 'hidden');
                                    await loadPeople();
                                },
                                onCancel: () => formHost.setAttribute('hidden', 'hidden')
                            }));
                            formHost.removeAttribute('hidden');
                            formHost.scrollIntoView({ behavior: 'smooth' });
                        };
                        reader.readAsDataURL(blob);
                    } catch (err) {
                        notice('error', 'Impossibile caricare l\'immagine.');
                    }
                }
            }) : null;

            return el('div', { className: 'device-row row--space' }, [
                el('div', { className: 'stack' }, [
                    el('div', { className: 'row row--wrap row--tight' }, [
                        personBadge,
                        log.isVerified ? chip('Verificato', 'ok') : null,
                        log.pose3d?.pose ? renderBiometricBadge(log.pose3d) : null,
                        el('strong', { textContent: `Telecamera: ${log.cameraName ?? log.cameraId}` }),
                        el('span', { className: 'section__hint mono', textContent: dateStr })
                    ]),
                    el('div', { className: 'row row--wrap row--tight' }, [
                        el('span', { className: 'section__hint', textContent: `Confidenza: ${confPct}` }),
                        log.box ? el('span', { className: 'section__hint mono', textContent: `Box: [${log.box.map(b => Number(b).toFixed(2)).join(', ')}]` }) : null
                    ])
                ]),
                el('div', { className: 'row row--tight' }, [correctBtn, addPersonBtn])
            ]);
        });

        logsHost.replaceChildren(...rows);
    }

    const tabPeopleBtn = el('button', {
        className: 'seg__btn seg__btn--on',
        type: 'button',
        textContent: 'Catalogo Persone',
        onclick: () => {
            currentTab = 'people';
            tabPeopleBtn.classList.add('seg__btn--on');
            tabLogsBtn.classList.remove('seg__btn--on');
            panelBody.replaceChildren(confirmHost, listHost);
            loadPeople();
        }
    });

    const tabLogsBtn = el('button', {
        className: 'seg__btn',
        type: 'button',
        textContent: 'Transiti & Forense',
        onclick: () => {
            currentTab = 'logs';
            tabLogsBtn.classList.add('seg__btn--on');
            tabPeopleBtn.classList.remove('seg__btn--on');
            panelBody.replaceChildren(confirmHost, logsHost);
            loadLogs();
        }
    });

    const addBtn = canManage ? el('button', {
        className: 'btn btn--primary btn--sm',
        type: 'button',
        onclick: () => {
            formHost.replaceChildren(renderAddPersonForm({
                api,
                onSaved: async () => {
                    formHost.setAttribute('hidden', 'hidden');
                    await loadPeople();
                },
                onCancel: () => formHost.setAttribute('hidden', 'hidden')
            }));
            formHost.removeAttribute('hidden');
            formHost.scrollIntoView({ behavior: 'smooth' });
        }
    }, [icon('plus'), el('span', { textContent: 'Nuova Persona' })]) : null;

    const panelBody = el('div', { className: 'panel__body' }, [confirmHost, listHost]);

    outlet.replaceChildren(
        el('div', { className: 'view__head' }, [
            el('h1', { className: 'view__title', textContent: 'Catalogo Persone & Volti' }),
            el('div', { className: 'row row--tight' }, [addBtn])
        ]),
        el('div', { className: 'row schedule-presets' }, [tabPeopleBtn, tabLogsBtn]),
        formHost,
        el('section', { className: 'panel' }, [panelBody])
    );

    await loadPeople();
    return outlet;
}
