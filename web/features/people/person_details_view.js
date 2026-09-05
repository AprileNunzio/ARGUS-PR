import { el, chip, empty, notice, confirmPanel } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { go } from '/assets/router.js';
import { createFace3DCanvas, renderBiometricBadge } from './people_face3d.js';

const ROLE_CHIPS = {
    dipendente: { label: 'Dipendente', variant: 'ok' },
    responsabile: { label: 'Responsabile', variant: 'info' },
    visitatore: { label: 'Visitatore', variant: 'warn' },
    fornitore: { label: 'Fornitore', variant: 'warn' },
    speciale: { label: 'VIP / Speciale', variant: 'violet' }
};

export async function renderPersonDetailsView({ api, session, personId }) {
    const outlet = el('div', { className: 'view' });
    const canManage = session.permissions.includes('camera.manage');

    const backBtn = el('button', {
        className: 'page-back',
        type: 'button',
        onclick: () => go('people')
    }, [icon('chevron-left'), el('span', { textContent: 'Torna al Catalogo' })]);

    const headerHost = el('div', { className: 'view__head' });
    const bodyHost = el('div', { className: 'stack' });

    try {
        const [personRes, logsRes] = await Promise.all([
            api.get(`/api/people/${personId}`),
            api.get(`/api/people/logs/faces?personId=${personId}&limit=100`)
        ]);

        const person = personRes.person;
        const logs = logsRes.faceLogs ?? [];

        const roleConfig = ROLE_CHIPS[person.role] ?? { label: person.role, variant: 'info' };
        const hasBiometrics = Array.isArray(person.embedding) && person.embedding.length > 0;
        const dateStr = new Date(person.createdAt).toLocaleDateString();

        // No inline styles for CSP
        const avatarEl = person.photoPath 
            ? el('img', { src: person.photoPath, className: 'person-card__avatar person-card__avatar--lg' })
            : el('div', { className: 'person-card__avatar person-card__avatar--lg' }, [icon('user')]);

        headerHost.replaceChildren(
            el('div', { className: 'stack stack--tight' }, [
                backBtn,
                el('div', { className: 'row row--wrap row--tight' }, [
                    avatarEl,
                    el('div', { className: 'stack stack--tight' }, [
                        el('h1', { className: 'view__title', textContent: person.name }),
                        el('div', { className: 'row row--wrap row--tight' }, [
                            chip(roleConfig.label, roleConfig.variant),
                            person.department ? chip(person.department, 'info') : null,
                            hasBiometrics ? chip(`Vettori: ${person.sampleCount || 1}`, 'ok') : chip('Nessun Vettore', 'warn')
                        ]),
                        el('span', { className: 'section__hint mono', textContent: `ID: ${person.id} • Iscritto il: ${dateStr}` })
                    ])
                ])
            ])
        );

        const permChips = (person.specialPermissions ?? []).map(perm => el('span', { className: 'chip chip--info mono', textContent: perm }));
        
        let canvas3D = null;
        if (person.face3dParams && Object.keys(person.face3dParams).length > 0) {
            canvas3D = el('div', { className: 'panel stack' }, [
                el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: 'Modello 3D & Posa' })]),
                el('div', { className: 'panel__body row row--center' }, [
                    createFace3DCanvas(person.face3dParams, 160, 160)
                ])
            ]);
        }

        const detailsPanel = el('div', { className: 'panel stack' }, [
            el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: 'Dettagli Profilo' })]),
            el('div', { className: 'panel__body stack' }, [
                person.notes ? el('div', { className: 'section__hint', textContent: person.notes }) : null,
                permChips.length > 0 ? el('div', { className: 'row row--wrap row--tight' }, [el('strong', { textContent: 'Permessi:' }), ...permChips]) : null,
                el('details', {}, [
                    el('summary', { textContent: 'Dati Grezzi (JSON)', className: 'mono section__hint cursor-pointer' }),
                    el('pre', { className: 'mono section__hint raw-json-box' }, [
                        el('code', { textContent: JSON.stringify(person, null, 2) })
                    ])
                ])
            ])
        ]);

        const galleryPanel = (person.gallery && person.gallery.length > 0) ? el('div', { className: 'panel stack' }, [
            el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: 'Galleria' })]),
            el('div', { className: 'panel__body row row--wrap' }, person.gallery.map(img => el('img', {
                src: img,
                className: 'gallery-img--lg'
            })))
        ]) : null;

        const renderLogCard = (log) => {
            const logDateStr = new Date(log.createdAt).toLocaleString();
            const confPct = `${Math.round((log.confidence ?? 0) * 100)}%`;
            const logImgEl = log.snapshotPath 
                ? el('img', { className: 'face-card__img', src: log.snapshotPath })
                : el('div', { className: 'face-card__img face-card__img--empty' }, [icon('eye-off')]);

            return el('article', { className: 'face-card' }, [
                el('div', { className: 'face-card__img-wrapper' }, [
                    logImgEl,
                    el('div', { className: 'face-card__overlay' }, [
                        log.isVerified ? chip('V', 'ok') : null,
                        log.pose3d?.pose ? chip('3D', 'info') : null
                    ]),
                    el('div', { className: 'face-card__confidence' }, [el('span', { textContent: `MATCH ${confPct}` })])
                ]),
                el('div', { className: 'face-card__body' }, [
                    el('div', { className: 'section__hint mono face-card__details' }, [
                        el('div', { textContent: `ID: ${log.id.split('-')[0].toUpperCase()}` }),
                        el('div', { textContent: logDateStr }),
                        el('div', { textContent: `Cam: ${log.cameraName ?? log.cameraId}` })
                    ])
                ])
            ]);
        };

        const logsPanel = el('div', { className: 'panel stack' }, [
            el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: `Ultimi Transiti (${logs.length})` })]),
            logs.length > 0
                ? el('div', { className: 'faces-grid panel__body' }, logs.map(renderLogCard))
                : el('div', { className: 'panel__body' }, [empty('Nessun transito recente.')])
        ]);

        bodyHost.replaceChildren(
            el('div', { className: 'details-layout' }, [
                el('div', { className: 'stack details-main' }, [detailsPanel, galleryPanel].filter(Boolean)),
                canvas3D ? el('div', { className: 'details-side' }, [canvas3D]) : null
            ]),
            logsPanel
        );

    } catch (err) {
        headerHost.replaceChildren(backBtn);
        bodyHost.replaceChildren(notice('error', 'Impossibile caricare i dettagli della persona.'));
    }

    outlet.append(headerHost, bodyHost);
    return outlet;
}
