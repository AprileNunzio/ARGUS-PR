import { el, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { controlFor, isVisible } from './controls.js';

function pendingBanner(status, actions) {
    if (status?.phase !== 'awaiting-approval' || !status.targetRef) return null;

    const opensAt = status.message?.includes('finestra')
        ? el('span', { className: 'muted', textContent: status.message })
        : null;

    return el('section', { className: 'panel panel--accent rise' }, [
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title' }, [icon('download'), `Aggiornamento ${status.targetRef} pronto`]),
            opensAt
        ]),
        el('p', { className: 'panel__text', textContent: 'Il riavvio interrompe la registrazione per qualche secondo. Se la nuova versione non parte, viene ripristinata da sola quella precedente.' }),
        el('div', { className: 'row row--end' }, [
            el('button', { className: 'btn', type: 'button', textContent: 'Rimanda', onclick: actions.postpone }),
            el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Riavvia e aggiorna ora', onclick: actions.approve })
        ])
    ]);
}

function settingRow(entry, values, onChange) {
    const row = el('div', { className: entry.sensitive ? 'setting setting--sensitive' : 'setting' }, [
        el('div', { className: 'setting__text' }, [
            el('span', { className: 'setting__label', textContent: entry.label }),
            entry.help ? el('span', { className: 'setting__help', textContent: entry.help }) : null
        ]),
        el('div', { className: 'setting__control' }, [controlFor(entry, (value) => onChange(entry.key, value))])
    ]);

    if (entry.dependsOn) row.dataset.depends = JSON.stringify(entry.dependsOn);
    row.hidden = !isVisible(entry, values);

    return row;
}

function groupCard(group, entries, values, onChange) {
    return el('section', { className: 'panel rise' }, [
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title' }, [icon(group.icon), group.label])
        ]),
        el('div', { className: 'setting-list' }, entries.map((entry) => settingRow(entry, values, onChange)))
    ]);
}

export async function renderSettings({ api }) {
    const root = el('div', { className: 'view' });

    const rerender = async () => {
        const [payload, updates] = await Promise.all([
            api.get('/api/settings'),
            api.get('/api/updates/status').catch(() => null)
        ]);

        const values = Object.fromEntries(payload.settings.map((entry) => [entry.key, entry.value]));
        const draft = {};
        const feedback = el('div', { className: 'row' });
        const save = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Salva' });

        save.disabled = true;

        const onChange = (key, value) => {
            draft[key] = value;
            values[key] = value;
            save.disabled = false;
            feedback.replaceChildren();

            for (const node of root.querySelectorAll('[data-depends]')) {
                const dependency = JSON.parse(node.dataset.depends);
                node.hidden = values[dependency.key] !== dependency.value;
            }
        };

        save.addEventListener('click', async () => {
            save.disabled = true;

            try {
                await api.put('/api/settings', draft);
                feedback.replaceChildren(notice('ok', 'Impostazioni salvate.'));
                await rerender();
            } catch (error) {
                save.disabled = false;
                feedback.replaceChildren(notice('error', error.message));
            }
        });

        const actions = {
            approve: async () => {
                await api.post('/api/updates/approve').catch((error) => {
                    feedback.replaceChildren(notice('error', error.message));
                });
            },
            postpone: async () => {
                await api.post('/api/updates/postpone').catch(() => {});
                await rerender();
            }
        };

        const cards = payload.groups.map((group) => groupCard(
            group,
            payload.settings.filter((entry) => entry.group === group.id),
            values,
            onChange
        ));

        root.replaceChildren(
            el('header', { className: 'view__head' }, [
                el('h1', { className: 'view__title', textContent: 'Impostazioni' }),
                el('p', { className: 'view__sub', textContent: 'Porta HTTPS, certificato e percorsi dei dati restano nel file di ambiente della macchina: un valore sbagliato li renderebbe irraggiungibili proprio da qui.' })
            ]),
            pendingBanner(updates, actions),
            ...cards,
            el('div', { className: 'row row--end' }, [feedback, save])
        );
    };

    await rerender();
    return root;
}
