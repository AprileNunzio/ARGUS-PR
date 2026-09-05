import { el, chip, empty, notice, confirmPanel } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { go } from '/assets/router.js';
import { createFace3DViewer, renderBiometricBadge } from './people_face3d.js';
import { createPersonPicker } from './person_picker.js';
import { createFaceLogCard, roleChipFor } from './face_log_card.js';

const PERMISSION_LABELS = Object.freeze({
    varchi: 'Accesso varchi',
    h24: 'Transito H24',
    vip: 'Accesso VIP',
    allarme_silenzioso: 'Allerta silenziosa'
});

function statTile(label, value, hint) {
    return el('div', { className: 'person-stat' }, [
        el('span', { className: 'person-stat__value', textContent: value }),
        el('span', { className: 'person-stat__label', textContent: label }),
        hint ? el('span', { className: 'person-stat__hint mono', textContent: hint }) : null
    ]);
}

function summarise(logs) {
    if (logs.length === 0) {
        return { total: 0, last: '—', cameras: 0, avgConfidence: '—' };
    }
    const cameras = new Set(logs.map((log) => log.cameraId));
    const confidences = logs.map((log) => log.confidence ?? 0);
    const average = confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
    return {
        total: logs.length,
        last: new Date(logs[0].createdAt).toLocaleString(),
        cameras: cameras.size,
        avgConfidence: `${Math.round(average * 100)}%`
    };
}

function buildIdentityPanel(person) {
    const rows = [
        ['Ruolo', roleChipFor(person.role).label],
        ['Reparto', person.department || '—'],
        ['Campioni biometrici', String(person.sampleCount || 1)],
        ['Osservazioni 3D', String(Math.round(person.face3dParams?.observations ?? 0))],
        ['Vettore facciale', person.embedding?.length > 0 ? `${person.embedding.length}-D attivo` : 'assente'],
        ['Iscritto il', new Date(person.createdAt).toLocaleString()],
        ['Ultimo aggiornamento', new Date(person.updatedAt).toLocaleString()],
        ['ID interno', person.id]
    ];

    return el('div', { className: 'panel stack' }, [
        el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: 'Scheda identità' })]),
        el('div', { className: 'panel__body' }, [
            el('dl', { className: 'person-facts' }, rows.flatMap(([label, value]) => [
                el('dt', { textContent: label }),
                el('dd', { className: 'mono', textContent: value })
            ]))
        ])
    ]);
}

function buildPermissionsPanel(person) {
    const permissions = person.specialPermissions ?? [];
    return el('div', { className: 'panel stack' }, [
        el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: 'Privilegi e note' })]),
        el('div', { className: 'panel__body stack stack--tight' }, [
            permissions.length > 0
                ? el('div', { className: 'row row--wrap row--tight' }, permissions.map((permission) => chip(PERMISSION_LABELS[permission] ?? permission, 'info')))
                : el('span', { className: 'section__hint', textContent: 'Nessun privilegio speciale assegnato.' }),
            person.notes
                ? el('p', { className: 'person-notes', textContent: person.notes })
                : el('span', { className: 'section__hint', textContent: 'Nessuna nota operativa.' })
        ])
    ]);
}

function buildRawPanel(person) {
    return el('details', { className: 'panel person-raw' }, [
        el('summary', { className: 'panel__head cursor-pointer' }, [
            el('span', { className: 'panel__title mono', textContent: 'Dati grezzi del profilo (JSON)' })
        ]),
        el('div', { className: 'panel__body' }, [
            el('pre', { className: 'mono section__hint raw-json-box' }, [
                el('code', { textContent: JSON.stringify({ ...person, embedding: `${person.embedding?.length ?? 0} valori` }, null, 2) })
            ])
        ])
    ]);
}

export async function renderPersonDetailsView({ api, session, personId }) {
    const outlet = el('div', { className: 'view' });
    const canManage = session.permissions.includes('camera.manage');

    const backBtn = el('button', {
        className: 'page-back',
        type: 'button',
        onclick: () => go('people')
    }, [icon('chevronLeft'), el('span', { textContent: 'Torna al catalogo' })]);

    const headerHost = el('div', { className: 'view__head' });
    const bodyHost = el('div', { className: 'stack' });
    const dialogHost = el('div', {});

    const loaded = await Promise.all([
        api.get(`/api/people/${personId}`),
        api.get(`/api/people/logs/faces?personId=${personId}&limit=100`),
        api.get('/api/people').catch(() => ({ people: [] }))
    ]).then((value) => ({ value })).catch((error) => ({ error }));

    if (loaded.error) {
        headerHost.replaceChildren(backBtn);
        bodyHost.replaceChildren(notice('error', `Impossibile caricare la scheda: ${loaded.error.message}`));
        outlet.append(headerHost, bodyHost);
        return outlet;
    }

    const [personRes, logsRes, allPeopleRes] = loaded.value;
    const person = personRes.person;
    const logs = logsRes.faceLogs ?? [];
    const allPeople = allPeopleRes.people ?? [];
    const stats = summarise(logs);
    const roleConfig = roleChipFor(person.role);
    const hasBiometrics = Array.isArray(person.embedding) && person.embedding.length > 0;

    const closeDialog = () => dialogHost.replaceChildren();

    const openDialog = (panel) => {
        dialogHost.replaceChildren(panel);
        dialogHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    const avatar = person.photoPath
        ? el('img', { src: person.photoPath, className: 'person-hero__avatar', alt: '' })
        : el('div', { className: 'person-hero__avatar person-hero__avatar--empty' }, [icon('users')]);

    const deleteBtn = canManage ? el('button', {
        className: 'btn btn--sm btn--danger',
        type: 'button',
        onclick: () => openDialog(confirmPanel({
            title: `Cancellare definitivamente ${person.name}?`,
            message: 'Vengono purgati profilo, vettori biometrici e tutti i transiti registrati. Operazione non reversibile.',
            confirmLabel: 'Cancella tutto',
            onCancel: closeDialog,
            onConfirm: async () => {
                await api.remove(`/api/people/${person.id}`).catch(() => undefined);
                go('people');
            }
        }))
    }, [icon('trash'), el('span', { textContent: 'Elimina' })]) : null;

    const mergeBtn = canManage ? el('button', {
        className: 'btn btn--sm btn--ghost',
        type: 'button',
        onclick: () => {
            const others = allPeople.filter((candidate) => candidate.id !== person.id);
            if (others.length === 0) {
                openDialog(notice('warn', 'Non ci sono altri profili nel catalogo con cui unire questa persona.'));
                return;
            }

            const picker = createPersonPicker({ people: others });
            const feedback = el('div', { hidden: 'hidden' });

            openDialog(el('div', { className: 'stack stack--tight' }, [
                confirmPanel({
                    title: `Unisci ${person.name} a un profilo esistente`,
                    message: 'Cerca e seleziona il profilo reale di destinazione: tutti i transiti passano a quello, e questa scheda viene rimossa.',
                    body: picker.element,
                    confirmLabel: 'Esegui fusione',
                    onCancel: closeDialog,
                    onConfirm: async () => {
                        if (!picker.value) {
                            feedback.replaceChildren(notice('warn', 'Seleziona prima il profilo di destinazione.'));
                            feedback.removeAttribute('hidden');
                            return;
                        }
                        const outcome = await api.post(`/api/people/${person.id}/merge`, { targetId: picker.value })
                            .then(() => null)
                            .catch((error) => error);
                        if (outcome) {
                            feedback.replaceChildren(notice('error', outcome.message));
                            feedback.removeAttribute('hidden');
                            return;
                        }
                        go('people', picker.value);
                    }
                }),
                feedback
            ]));
            picker.focus();
        }
    }, [icon('move'), el('span', { textContent: 'Unisci…' })]) : null;

    headerHost.replaceChildren(
        el('div', { className: 'stack stack--tight person-hero' }, [
            backBtn,
            el('div', { className: 'person-hero__row' }, [
                avatar,
                el('div', { className: 'stack stack--tight person-hero__identity' }, [
                    el('h1', { className: 'view__title', textContent: person.name }),
                    el('div', { className: 'row row--wrap row--tight' }, [
                        chip(roleConfig.label, roleConfig.variant),
                        person.department ? chip(person.department, 'info') : null,
                        hasBiometrics ? chip(`Vettore ${person.embedding.length}-D`, 'ok') : chip('Nessun vettore biometrico', 'warn'),
                        person.face3dParams?.pose ? renderBiometricBadge(person.face3dParams) : null
                    ]),
                    el('span', { className: 'section__hint mono', textContent: `ID ${person.id}` })
                ]),
                el('div', { className: 'row row--tight person-hero__actions' }, [mergeBtn, deleteBtn].filter(Boolean))
            ])
        ])
    );

    const has3d = person.face3dParams && Object.keys(person.face3dParams).length > 0;
    const pointCount = person.face3dParams?.landmarkCount ?? 0;
    const observations = Math.round(person.face3dParams?.observations ?? 0);
    const modelHint = observations > 0
        ? `${observations} osservazioni apprese`
        : (pointCount > 0 ? `${pointCount} punti facciali` : 'posa stimata');

    const statsStrip = el('div', { className: 'person-stats' }, [
        statTile('Transiti', String(stats.total), 'ultimi 100'),
        statTile('Telecamere', String(stats.cameras), 'canali distinti'),
        statTile('Match medio', stats.avgConfidence, 'confidenza'),
        statTile('Campioni', String(person.sampleCount || 1), 'vettori appresi'),
        statTile('Modello 3D', observations > 0 ? String(observations) : '—', 'osservazioni'),
        statTile('Ultimo avvistamento', stats.last, null)
    ]);

    const modelPanel = el('div', { className: 'panel stack' }, [
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title', textContent: 'Modello 3D e posa' }),
            el('span', { className: 'section__hint mono', textContent: modelHint })
        ]),
        el('div', { className: 'panel__body stack stack--tight person-model' }, [
            has3d
                ? createFace3DViewer(person.face3dParams, { width: 460, height: 520 })
                : empty('Nessun dato di posa: registra una foto per generare il modello.'),
            el('span', { className: 'section__hint', textContent: observations > 0
                ? `La geometria si riadatta a ogni avvistamento: le proporzioni del volto sono la media pesata di ${observations} osservazioni, con più peso ai fotogrammi frontali e nitidi.`
                : 'La geometria è deformata dalle proporzioni biometriche misurate sul volto. Si affinerà da sola a ogni passaggio davanti alle telecamere.' })
        ])
    ]);

    const galleryPanel = (person.gallery && person.gallery.length > 0) ? el('div', { className: 'panel stack' }, [
        el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: `Galleria (${person.gallery.length})` })]),
        el('div', { className: 'panel__body row row--wrap' }, person.gallery.map((image) => el('img', {
            src: image,
            className: 'gallery-img--lg',
            alt: ''
        })))
    ]) : null;

    const logsHost = el('div', { className: 'faces-grid panel__body' });

    async function reloadLogs() {
        const data = await api.get(`/api/people/logs/faces?personId=${personId}&limit=100`).catch(() => ({ faceLogs: [] }));
        const fresh = data.faceLogs ?? [];
        if (fresh.length === 0) {
            logsHost.className = 'panel__body';
            logsHost.replaceChildren(empty('Nessun transito registrato per questa persona.'));
            return;
        }
        logsHost.className = 'faces-grid panel__body';
        logsHost.replaceChildren(...fresh.map(renderLogCard));
    }

    function renderLogCard(log) {
        const deleteLogBtn = canManage ? el('button', {
            className: 'btn btn--sm btn--danger btn--full',
            type: 'button',
            textContent: 'Elimina transito',
            onclick: () => openDialog(confirmPanel({
                title: 'Eliminare questo transito?',
                message: `Rilevamento del ${new Date(log.createdAt).toLocaleString()} su ${log.cameraName ?? log.cameraId}.`,
                confirmLabel: 'Elimina',
                onCancel: closeDialog,
                onConfirm: async () => {
                    await api.remove(`/api/people/logs/${log.id}`).catch(() => undefined);
                    closeDialog();
                    await reloadLogs();
                }
            }))
        }) : null;

        return createFaceLogCard({
            log,
            badge: chip(new Date(log.createdAt).toLocaleDateString(), 'info'),
            actions: [deleteLogBtn]
        });
    }

    if (logs.length === 0) {
        logsHost.className = 'panel__body';
        logsHost.replaceChildren(empty('Nessun transito registrato per questa persona.'));
    } else {
        logsHost.replaceChildren(...logs.map(renderLogCard));
    }

    const logsPanel = el('div', { className: 'panel stack' }, [
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title', textContent: 'Transiti registrati' }),
            el('span', { className: 'section__hint mono', textContent: `${logs.length} eventi` })
        ]),
        logsHost
    ]);

    bodyHost.replaceChildren(
        dialogHost,
        statsStrip,
        el('div', { className: 'person-layout' }, [
            el('div', { className: 'stack person-layout__side' }, [modelPanel, galleryPanel].filter(Boolean)),
            el('div', { className: 'stack person-layout__main' }, [
                buildIdentityPanel(person),
                buildPermissionsPanel(person),
                buildRawPanel(person)
            ])
        ]),
        logsPanel
    );

    outlet.append(headerHost, bodyHost);
    return outlet;
}
