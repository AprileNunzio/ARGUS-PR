import { el, chip, notice, empty } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card } from '/assets/ui.js';
import { go } from '/assets/router.js';
import { renderUserDetail } from './user_detail.js';
import { renderUserCreate } from './user_create.js';
import { renderRecoveryMailer } from './recovery_view.js';

const ROLE_LABELS = Object.freeze({ admin: 'Amministratore', operator: 'Operatore', viewer: 'Osservatore' });
const ROLE_TONES = Object.freeze({ admin: 'ok', operator: 'info', viewer: 'warn' });

function initials(user) {
    const source = user.fullName ?? user.username;
    return source.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || '?';
}

function userCard(user, onOpen) {
    const meta = [
        user.email ?? 'nessuna email registrata',
        user.jobTitle,
        user.lastLoginAt ? `ultimo accesso ${new Date(user.lastLoginAt).toLocaleString('it-IT')}` : 'mai entrato'
    ].filter(Boolean).join(' · ');

    const open = el('button', { className: 'btn btn--sm', type: 'button' }, [
        icon('edit'),
        el('span', { textContent: 'Apri scheda' })
    ]);

    open.addEventListener('click', () => onOpen(user));

    return el('div', { className: 'user-card' }, [
        el('span', { className: 'user-card__avatar', textContent: initials(user) }),
        el('div', { className: 'user-card__body' }, [
            el('span', { className: 'user-card__name', textContent: user.fullName ?? user.username }),
            el('span', { className: 'user-card__meta', textContent: meta })
        ]),
        el('div', { className: 'row row--tight' }, [
            user.mfaEnabled ? chip('MFA', 'ok') : chip('senza MFA', 'warn'),
            user.active ? null : chip('sospeso', 'bad'),
            chip(ROLE_LABELS[user.role] ?? user.role, ROLE_TONES[user.role] ?? 'info')
        ]),
        open
    ]);
}

export async function renderUsers({ api, params = [], session }) {
    if (params[0] === 'nuovo') return renderUserCreate({ api });
    if (params[0] === 'recupero') return renderRecoveryMailer({ api });
    if (params[0]) return renderUserDetail({ api, userId: params[0], session });

    const host = el('div', { className: 'xstack' });
    const feedback = el('div', {});

    const catalogue = await api.get('/api/users/roles').catch(() => ({ roles: [], device: null }));
    const users = await api.get('/api/users').then((payload) => payload.users ?? []).catch((error) => {
        feedback.replaceChildren(notice('error', `Elenco non disponibile: ${error.message}`));
        return [];
    });

    const withoutEmail = users.filter((user) => !user.email).length;
    const withoutMfa = users.filter((user) => !user.mfaEnabled).length;

    const create = el('button', { className: 'btn btn--primary', type: 'button' }, [
        icon('plus'),
        el('span', { textContent: 'Nuovo utente' })
    ]);

    create.addEventListener('click', () => go('users', 'nuovo'));

    const recovery = el('button', { className: 'btn', type: 'button' }, [
        icon('lock'),
        el('span', { textContent: 'Server di recupero' })
    ]);

    recovery.addEventListener('click', () => go('users', 'recupero'));

    const identity = catalogue.device
        ? card({
            title: 'Identita di questo impianto',
            subtitle: 'Compare fra parentesi nel nome del codice a sei cifre, per distinguerlo dagli altri impianti nell app di autenticazione',
            iconName: 'shield',
            tone: 'purple',
            badge: chip(catalogue.device.shortId, 'info'),
            body: [
                el('p', { className: 'xcard__note' }, [
                    icon('info'),
                    el('span', {
                        textContent: `Nell app di autenticazione ogni account compare come "ARGUS-PR: email (${catalogue.device.label ? `${catalogue.device.label} ${catalogue.device.shortId}` : catalogue.device.shortId})". Il nome dell impianto si cambia in Impostazioni.`
                    })
                ])
            ]
        })
        : null;

    host.replaceChildren(
        feedback,
        el('div', { className: 'row row--between' }, [
            el('div', { className: 'row row--tight row--wrap' }, [
                chip(`${users.length} utenti`, 'info'),
                withoutEmail > 0 ? chip(`${withoutEmail} senza email di recupero`, 'warn') : null,
                withoutMfa > 0 ? chip(`${withoutMfa} senza secondo fattore`, 'warn') : null
            ]),
            el('div', { className: 'row row--tight' }, [recovery, create])
        ]),
        card({
            title: 'Utenti dell impianto',
            subtitle: 'Ogni scheda raccoglie anagrafica, recapiti, ruolo, permessi e notifiche',
            iconName: 'users',
            tone: 'cyan',
            body: users.length === 0
                ? [empty('Nessun utente oltre a quello in uso.')]
                : users.map((user) => userCard(user, (target) => go('users', target.id)))
        }),
        identity
    );

    return host;
}
