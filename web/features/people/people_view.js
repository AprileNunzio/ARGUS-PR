import { el, chip, empty, notice, confirmPanel } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { go } from '/assets/router.js';
import { renderPersonDetailsView } from './person_details_view.js';
import { renderNewPersonView } from './person_new_view.js';
import { createPersonCard } from './person_card.js';
import { createPersonPicker } from './person_picker.js';
import { createFaceLogCard, roleChipFor } from './face_log_card.js';

const LOGS_LIMIT = 100;

export async function renderPeopleView({ api, session, params }) {
    if (params && params[0] === 'new') {
        return renderNewPersonView({ api, session });
    }
    if (params && params[0]) {
        return renderPersonDetailsView({ api, session, personId: params[0] });
    }

    const outlet = el('div', { className: 'view' });
    const canManage = session.permissions.includes('camera.manage');

    let currentTab = 'people';
    let peopleCache = [];
    let logsCache = [];
    let unknownOnly = false;

    const dialogHost = el('div', {});
    const listHost = el('div', { className: 'stack' });
    const logsHost = el('div', { className: 'stack' });
    const countBadge = el('span', { className: 'section__hint mono' });

    const closeDialog = () => dialogHost.replaceChildren();

    const openDialog = (panel) => {
        dialogHost.replaceChildren(panel);
        dialogHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    function confirmDeletePerson(person) {
        openDialog(confirmPanel({
            title: `Cancellare definitivamente ${person.name}?`,
            message: 'Vengono purgati il profilo, i vettori biometrici e tutti i transiti registrati, ai sensi del GDPR. Operazione non reversibile.',
            confirmLabel: 'Cancella tutto',
            onCancel: closeDialog,
            onConfirm: async () => {
                await api.remove(`/api/people/${person.id}`).catch(() => undefined);
                closeDialog();
                await loadPeople();
            }
        }));
    }

    function confirmMergePerson(person) {
        const others = peopleCache.filter((candidate) => candidate.id !== person.id);
        if (others.length === 0) {
            openDialog(notice('warn', 'Non ci sono altri profili nel catalogo con cui unire questa persona.'));
            return;
        }

        const picker = createPersonPicker({ people: others });
        const feedback = el('div', { hidden: 'hidden' });

        openDialog(el('div', { className: 'stack stack--tight' }, [
            confirmPanel({
                title: `Unisci ${person.name} a un profilo esistente`,
                message: 'Cerca e seleziona il profilo reale di destinazione: tutti i transiti passano a quello e questa scheda viene rimossa.',
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
                    closeDialog();
                    await loadPeople();
                }
            }),
            feedback
        ]));
        picker.focus();
    }

    function openAssociateDialog(log) {
        if (peopleCache.length === 0) {
            openDialog(notice('warn', 'Il catalogo è vuoto: registra prima una persona, poi potrai associarle i transiti.'));
            return;
        }

        const picker = createPersonPicker({
            people: peopleCache,
            selectedId: log.correctedPersonId ?? log.personId ?? null,
            allowNone: true,
            noneLabel: 'Nessuna corrispondenza (resta sconosciuto)'
        });
        const feedback = el('div', { hidden: 'hidden' });

        openDialog(el('div', { className: 'stack stack--tight' }, [
            confirmPanel({
                title: 'Associa il transito a una persona del catalogo',
                message: log.hasEmbedding
                    ? 'Cerca e seleziona la persona: il vettore biometrico di questo transito viene appreso dal profilo, così i prossimi passaggi vengono riconosciuti da soli.'
                    : 'Cerca e seleziona la persona. Questo transito non ha un vettore biometrico, quindi correggerà solo lo storico senza migliorare il riconoscimento.',
                body: picker.element,
                confirmLabel: 'Associa',
                onCancel: closeDialog,
                onConfirm: async () => {
                    const outcome = await api.post(`/api/people/logs/${log.id}/correct`, { personId: picker.value })
                        .then((value) => ({ value }))
                        .catch((error) => ({ error }));

                    if (outcome.error) {
                        feedback.replaceChildren(notice('error', outcome.error.message));
                        feedback.removeAttribute('hidden');
                        await loadLogs();
                        return;
                    }

                    closeDialog();
                    await Promise.all([loadPeople({ silent: true }), loadLogs()]);
                    if (outcome.value.learned) {
                        openDialog(notice('ok', 'Associazione salvata e vettore biometrico aggiornato: il profilo ora riconosce questo volto.'));
                    }
                }
            }),
            feedback
        ]));
        picker.focus();
    }

    function confirmDeleteLog(log) {
        openDialog(confirmPanel({
            title: 'Eliminare questo transito?',
            message: `Rilevamento del ${new Date(log.createdAt).toLocaleString()} su ${log.cameraName ?? log.cameraId}.`,
            confirmLabel: 'Elimina',
            onCancel: closeDialog,
            onConfirm: async () => {
                await api.remove(`/api/people/logs/${log.id}`).catch(() => undefined);
                closeDialog();
                await loadLogs();
            }
        }));
    }

    function confirmPurgeAll() {
        const isPeopleTab = currentTab === 'people';
        const count = isPeopleTab ? peopleCache.length : logsCache.length;
        if (count === 0) {
            openDialog(notice('warn', isPeopleTab ? 'Il catalogo è già vuoto.' : 'Non ci sono transiti da eliminare.'));
            return;
        }

        openDialog(confirmPanel({
            title: isPeopleTab ? 'Svuotare tutto il catalogo persone?' : 'Eliminare tutti i transiti registrati?',
            message: isPeopleTab
                ? `Vengono cancellati ${count} profili con i relativi vettori biometrici e tutti i transiti collegati. Operazione non reversibile.`
                : 'Vengono cancellati tutti i log dei volti e le relative istantanee. I profili del catalogo restano intatti. Operazione non reversibile.',
            confirmLabel: isPeopleTab ? 'Cancella tutto il catalogo' : 'Cancella tutti i transiti',
            onCancel: closeDialog,
            onConfirm: async () => {
                const path = isPeopleTab ? '/api/people/all' : '/api/people/logs/all';
                const outcome = await api.remove(path).then((value) => ({ value })).catch((error) => ({ error }));
                closeDialog();
                if (outcome.error) {
                    openDialog(notice('error', outcome.error.message));
                    return;
                }
                await (isPeopleTab ? loadPeople() : loadLogs());
            }
        }));
    }

    async function loadPeople({ silent = false } = {}) {
        const data = await api.get('/api/people').catch(() => ({ people: [] }));
        peopleCache = data.people ?? [];
        if (silent) return;

        countBadge.textContent = `${peopleCache.length} profili registrati`;

        if (peopleCache.length === 0) {
            listHost.className = 'stack';
            listHost.replaceChildren(empty('Nessuna persona iscritta nell\'anagrafica biometrica.'));
            return;
        }

        listHost.className = 'people-grid';
        listHost.replaceChildren(...peopleCache.map((person) => createPersonCard({
            person,
            canManage,
            onDelete: confirmDeletePerson,
            onMerge: confirmMergePerson
        })));
    }

    function renderLogCard(log) {
        const personId = log.correctedPersonId ?? log.personId ?? null;
        const person = personId ? peopleCache.find((candidate) => candidate.id === personId) : null;

        const badge = person
            ? chip(person.name, roleChipFor(person.role).variant)
            : chip('Sconosciuto', 'warn');

        const associateBtn = canManage ? el('button', {
            className: 'btn btn--sm btn--primary btn--full',
            type: 'button',
            textContent: person ? 'Riassocia…' : 'Associa a persona…',
            onclick: () => openAssociateDialog(log)
        }) : null;

        const enrolBtn = (!person && canManage && log.snapshotPath) ? el('button', {
            className: 'btn btn--sm btn--ghost btn--full',
            type: 'button',
            textContent: 'Crea nuovo profilo',
            onclick: () => {
                sessionStorage.setItem('argus_new_person_base64', log.snapshotPath);
                sessionStorage.setItem('argus_new_person_log', log.id);
                go('people', 'new');
            }
        }) : null;

        const deleteBtn = canManage ? el('button', {
            className: 'btn btn--sm btn--danger btn--full',
            type: 'button',
            textContent: 'Elimina',
            onclick: () => confirmDeleteLog(log)
        }) : null;

        return createFaceLogCard({ log, badge, actions: [associateBtn, enrolBtn, deleteBtn] });
    }

    function paintLogs() {
        const visible = unknownOnly
            ? logsCache.filter((log) => !(log.correctedPersonId ?? log.personId))
            : logsCache;

        countBadge.textContent = `${visible.length} transiti${unknownOnly ? ' sconosciuti' : ''} su ${logsCache.length}`;

        if (visible.length === 0) {
            logsHost.className = 'stack';
            logsHost.replaceChildren(empty(unknownOnly
                ? 'Nessun transito sconosciuto: tutti i volti recenti sono già associati.'
                : 'Nessun transito facciale registrato dalle telecamere.'));
            return;
        }

        logsHost.className = 'faces-grid';
        logsHost.replaceChildren(...visible.map(renderLogCard));
    }

    async function loadLogs() {
        const [logsData, peopleData] = await Promise.all([
            api.get(`/api/people/logs/faces?limit=${LOGS_LIMIT}`).catch(() => ({ faceLogs: [] })),
            api.get('/api/people').catch(() => ({ people: [] }))
        ]);
        logsCache = logsData.faceLogs ?? [];
        peopleCache = peopleData.people ?? [];
        paintLogs();
    }

    const unknownToggle = el('button', {
        className: 'btn btn--sm btn--ghost',
        type: 'button',
        textContent: 'Solo sconosciuti',
        onclick: () => {
            unknownOnly = !unknownOnly;
            unknownToggle.classList.toggle('btn--on', unknownOnly);
            paintLogs();
        }
    });

    const purgeBtn = canManage ? el('button', {
        className: 'btn btn--sm btn--danger',
        type: 'button',
        onclick: confirmPurgeAll
    }, [icon('trash'), el('span', { textContent: 'Elimina tutti' })]) : null;

    const addBtn = canManage ? el('button', {
        className: 'btn btn--primary btn--sm',
        type: 'button',
        onclick: () => go('people', 'new')
    }, [icon('plus'), el('span', { textContent: 'Nuova persona' })]) : null;

    const toolbar = el('div', { className: 'row row--tight' }, [unknownToggle]);
    toolbar.setAttribute('hidden', 'hidden');

    const panelBody = el('div', { className: 'panel__body stack' }, [dialogHost, listHost]);

    function selectTab(tab) {
        currentTab = tab;
        tabPeopleBtn.classList.toggle('seg__btn--on', tab === 'people');
        tabLogsBtn.classList.toggle('seg__btn--on', tab === 'logs');
        closeDialog();

        if (tab === 'people') {
            toolbar.setAttribute('hidden', 'hidden');
            panelBody.replaceChildren(dialogHost, listHost);
            loadPeople();
            return;
        }

        toolbar.removeAttribute('hidden');
        panelBody.replaceChildren(dialogHost, logsHost);
        loadLogs();
    }

    const tabPeopleBtn = el('button', {
        className: 'seg__btn seg__btn--on',
        type: 'button',
        textContent: 'Catalogo persone',
        onclick: () => selectTab('people')
    });

    const tabLogsBtn = el('button', {
        className: 'seg__btn',
        type: 'button',
        textContent: 'Transiti e forense',
        onclick: () => selectTab('logs')
    });

    outlet.replaceChildren(
        el('div', { className: 'view__head' }, [
            el('div', { className: 'stack stack--tight' }, [
                el('h1', { className: 'view__title', textContent: 'Catalogo persone e volti' }),
                countBadge
            ]),
            el('div', { className: 'row row--tight' }, [addBtn, purgeBtn].filter(Boolean))
        ]),
        el('div', { className: 'row row--between people-toolbar' }, [
            el('div', { className: 'row schedule-presets' }, [tabPeopleBtn, tabLogsBtn]),
            toolbar
        ]),
        el('section', { className: 'panel' }, [panelBody])
    );

    await loadPeople();
    return outlet;
}
