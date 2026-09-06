import { el, chip } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { go } from '/assets/router.js';
import { createFace3DCanvas, renderBiometricBadge } from './people_face3d.js';
import { roleChipFor } from './face_log_card.js';

const PERMISSION_LABELS = Object.freeze({
    varchi: 'Varchi',
    h24: 'H24',
    vip: 'VIP',
    allarme_silenzioso: 'Allarme'
});

export function createPersonCard({ person, canManage, onDelete, onMerge }) {
    const hasBiometrics = Array.isArray(person.embedding) && person.embedding.length > 0;
    const roleConfig = roleChipFor(person.role);
    const has3d = person.face3dParams && Object.keys(person.face3dParams).length > 0;

    const avatar = person.photoPath
        ? el('img', { src: person.photoPath, className: 'person-card__avatar', alt: '' })
        : el('div', { className: 'person-card__avatar person-card__avatar--empty' }, [icon('users')]);

    const permissionChips = (person.specialPermissions ?? []).map((permission) => (
        el('span', { className: 'chip chip--info mono', textContent: PERMISSION_LABELS[permission] ?? permission })
    ));

    const gallery = (person.gallery ?? []).map((photo) => el('img', {
        src: photo,
        className: 'person-card__gallery-img',
        alt: ''
    }));

    const deleteBtn = canManage ? el('button', {
        className: 'btn btn--sm btn--danger',
        type: 'button',
        textContent: 'Elimina',
        onclick: () => onDelete(person)
    }) : null;

    const mergeBtn = canManage ? el('button', {
        className: 'btn btn--sm btn--ghost',
        type: 'button',
        textContent: 'Unisci…',
        onclick: () => onMerge(person)
    }) : null;

    return el('article', {
        className: 'person-card person-card--clickable',
        onclick: (event) => {
            if (event.target.closest('button')) return;
            go('people', person.id);
        }
    }, [
        el('header', { className: 'person-card__header' }, [
            avatar,
            el('div', { className: 'person-card__info' }, [
                el('div', { className: 'person-card__name', textContent: person.name }),
                el('div', { className: 'row row--wrap row--tight' }, [
                    chip(roleConfig.label, roleConfig.variant),
                    person.department ? chip(person.department, 'info') : null,
                    hasBiometrics ? chip(`vettori: ${person.sampleCount || 1}`, 'ok') : chip('senza vettore', 'warn'),
                    has3d ? renderBiometricBadge(person.face3dParams) : null
                ])
            ])
        ]),
        el('div', { className: 'person-card__body' }, [
            permissionChips.length > 0 ? el('div', { className: 'row row--wrap row--tight' }, permissionChips) : null,
            person.notes ? el('div', { className: 'section__hint person-card__notes', textContent: person.notes }) : null,
            has3d ? el('div', { className: 'person-card__3d-container' }, [createFace3DCanvas(person.face3dParams, 110, 130)]) : null,
            gallery.length > 0 ? el('div', { className: 'person-card__gallery' }, gallery) : null,
            el('span', { className: 'section__hint mono', textContent: `Iscritto il ${new Date(person.createdAt).toLocaleDateString()}` })
        ]),
        (mergeBtn || deleteBtn) ? el('footer', { className: 'person-card__footer' }, [mergeBtn, deleteBtn].filter(Boolean)) : null
    ]);
}
