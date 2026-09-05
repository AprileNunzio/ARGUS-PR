import { el, notice, chip, empty, pageHead, confirmPanel } from '/assets/dom.js';
import { setBreadcrumbDetail } from '/assets/shell.js';
import { icon } from '/assets/icons.js';
import { go } from '/assets/router.js';
import { createCameraForm } from './camera_form.js';
import { probeSummary } from './camera_wizard.js';
import { renderCameraAnalytics } from './camera_analytics.js';
import { renderScheduleEditor } from '/features/scheduling/schedule_editor.js';
import { renderZoneEditor } from '/features/motion/zone_editor.js';

const TABS = Object.freeze([
    { id: 'general', label: 'Generale', glyph: 'settings' },
    { id: 'schedule', label: 'Pianificazione', glyph: 'clock' },
    { id: 'recording', label: 'Registrazione', glyph: 'record' },
    { id: 'zones', label: 'Zone di movimento', glyph: 'crop' },
    { id: 'analytics', label: 'Analisi AI', glyph: 'sparkles' },
    { id: 'diagnostics', label: 'Diagnostica', glyph: 'activity' }
]);

function sourceLabel(camera) {
    if (camera.sourceKind === 'usb') return camera.deviceId ?? 'periferica non configurata';
    return camera.mainStreamUrl ?? 'nessun flusso configurato';
}

function specRow(key, value) {
    return el('div', { className: 'spec' }, [
        el('span', { className: 'spec__k', textContent: key }),
        el('span', { className: 'spec__v', textContent: value ?? '--' })
    ]);
}

function generalTab({ api, camera }) {
    const form = createCameraForm({ api, camera });
    const feedback = el('div', { hidden: 'hidden' });
    const confirmHost = el('div', {});

    const saveButton = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Salva modifiche' });

    saveButton.addEventListener('click', async () => {
        saveButton.disabled = true;
        feedback.setAttribute('hidden', 'hidden');

        const outcome = await api.put(`/api/cameras/${camera.id}`, form.values())
            .then(() => null)
            .catch((error) => error);

        saveButton.disabled = false;

        if (outcome) {
            feedback.replaceChildren(notice('error', outcome.message));
            feedback.removeAttribute('hidden');
            return;
        }

        feedback.replaceChildren(notice('ok', 'Configurazione applicata. Le pipeline attive sono state riavviate.'));
        feedback.removeAttribute('hidden');
    });

    const deleteButton = el('button', { className: 'btn btn--danger', type: 'button', textContent: 'Elimina canale' });

    deleteButton.addEventListener('click', () => {
        deleteButton.disabled = true;
        confirmHost.replaceChildren(confirmPanel({
            title: `Eliminare il canale "${camera.name}"?`,
            message: 'Il canale sparisce dalla configurazione. Le registrazioni gia scritte su disco restano dove sono.',
            confirmLabel: 'Elimina definitivamente',
            onCancel: () => {
                deleteButton.disabled = false;
                confirmHost.replaceChildren();
            },
            onConfirm: async () => {
                await api.remove(`/api/cameras/${camera.id}`).catch(() => undefined);
                go('cameras');
            }
        }));
        confirmHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    return el('div', { className: 'stack' }, [
        form.node,
        feedback,
        el('div', { className: 'row row--between' }, [deleteButton, saveButton]),
        confirmHost
    ]);
}

function recordingTab({ api, camera, recorder }) {
    const active = recorder ? recorder.enabled : false;

    const toggle = el('button', {
        className: 'btn btn--sm',
        type: 'button',
        textContent: active ? 'Interrompi registrazione' : 'Avvia registrazione'
    });

    toggle.addEventListener('click', async () => {
        toggle.disabled = true;
        await api.post(`/api/recording/${camera.id}`, { enabled: !active }).catch(() => undefined);
        go('cameras', camera.id, 'recording');
    });

    return el('div', { className: 'stack' }, [
        el('div', { className: 'row row--between' }, [
            el('div', { className: 'row row--tight' }, [
                icon('record'),
                active ? chip('registrazione attiva', 'ok') : chip('registrazione ferma', 'warn')
            ]),
            toggle
        ]),
        renderScheduleEditor({
            camera,
            api,
            onSaved: () => go('cameras', camera.id, 'recording'),
            onCancel: () => undefined
        })
    ]);
}

function diagnosticsTab({ api, camera }) {
    const result = el('div', {});

    const probeButton = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Verifica sorgente' });

    probeButton.addEventListener('click', async () => {
        probeButton.disabled = true;
        probeButton.textContent = 'Verifica in corso…';

        const outcome = await api.post(`/api/cameras/${camera.id}/probe`)
            .then((value) => ({ value }))
            .catch((error) => ({ error }));

        probeButton.disabled = false;
        probeButton.textContent = 'Verifica sorgente';

        result.replaceChildren(outcome.error ? notice('error', outcome.error.message) : probeSummary(outcome.value));
    });

    return el('div', { className: 'stack' }, [
        el('div', { className: 'spec-grid' }, [
            specRow('Identificativo', camera.id),
            specRow('Tipo sorgente', camera.sourceKind),
            specRow('Sorgente', sourceLabel(camera)),
            specRow('Flusso secondario', camera.subStreamUrl),
            specRow('Trasporto', camera.sourceKind === 'usb' ? 'locale' : (camera.transport ?? '--').toUpperCase()),
            specRow('Credenziali', camera.hasPassword ? 'memorizzate e cifrate' : 'nessuna'),
            specRow('Accelerazione', camera.hwaccel ?? 'predefinita'),
            specRow('Ritenzione', camera.retentionDays ? `${camera.retentionDays} giorni` : 'globale'),
            specRow('Creato il', camera.createdAt),
            specRow('Aggiornato il', camera.updatedAt)
        ]),
        el('div', { className: 'row row--tight' }, [
            probeButton,
            el('button', {
                className: 'btn',
                type: 'button',
                onclick: () => go('cameras', camera.id, 'autoconfig')
            }, [icon('sparkles'), el('span', { textContent: 'Autoconfigurazione guidata' })]),
            el('button', { className: 'btn', type: 'button', textContent: 'Apri in Diretta', onclick: () => go('live') })
        ]),
        result
    ]);
}

function tabContent({ api, session, camera, recorder, tab }) {
    if (tab === 'schedule') {
        return renderScheduleEditor({
            camera,
            api,
            onSaved: () => go('cameras', camera.id, 'schedule'),
            onCancel: () => go('cameras', camera.id, 'general')
        });
    }
    if (tab === 'recording') return recordingTab({ api, camera, recorder });
    if (tab === 'zones') {
        return camera.sourceKind === 'usb' && !camera.deviceId
            ? empty('Configura prima la periferica di acquisizione.')
            : renderZoneEditor({ camera, api, onSaved: () => undefined, onCancel: () => undefined });
    }
    if (tab === 'analytics') return renderCameraAnalytics({ api, camera, session });
    if (tab === 'diagnostics') return diagnosticsTab({ api, camera });
    return generalTab({ api, camera });
}

export function renderCameraDetail({ api, session, camera, recorder, tab = 'general' }) {
    const active = TABS.some((entry) => entry.id === tab) ? tab : 'general';

    const tabs = el('nav', { className: 'tabs' }, TABS.map((entry) => el('button', {
        className: entry.id === active ? 'tab tab--active' : 'tab',
        type: 'button',
        onclick: () => go('cameras', camera.id, entry.id)
    }, [icon(entry.glyph), el('span', { textContent: entry.label })])));

    const activeTab = TABS.find((entry) => entry.id === active);
    setBreadcrumbDetail(activeTab ? `${camera.name} · ${activeTab.label}` : camera.name);

    return el('div', { className: 'view view--tight' }, [
        pageHead({
            title: camera.name,
            hint: sourceLabel(camera),
            actions: [camera.enabled ? chip('attivo', 'ok') : chip('disattivo', 'warn')]
        }),
        el('section', { className: 'panel' }, [
            el('div', { className: 'panel__head' }, [tabs]),
            el('div', { className: 'panel__body' }, [tabContent({ api, session, camera, recorder, tab: active })])
        ])
    ]);
}
