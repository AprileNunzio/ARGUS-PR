import { el, notice, chip, empty } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { createCameraForm } from './camera_form.js';
import { probeSummary } from './camera_wizard.js';
import { renderAutoconfigure } from './camera_autoconfig.js';
import { renderCameraAnalytics } from './camera_analytics.js';
import { renderScheduleEditor } from '/features/scheduling/schedule_editor.js';
import { renderZoneEditor } from '/features/motion/zone_editor.js';

const TABS = Object.freeze([
    { id: 'general', label: 'Generale', glyph: 'settings' },
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

function generalTab({ api, camera, onChanged, onBack }) {
    const form = createCameraForm({ api, camera });
    const feedback = el('div', { hidden: 'hidden' });
    const saveButton = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Salva modifiche' });

    saveButton.addEventListener('click', async () => {
        saveButton.disabled = true;
        feedback.setAttribute('hidden', 'hidden');

        const outcome = await api.put(`/api/cameras/${camera.id}`, form.values())
            .then((result) => ({ result }))
            .catch((error) => ({ error }));

        saveButton.disabled = false;

        if (outcome.error) {
            feedback.replaceChildren(notice('error', outcome.error.message));
            feedback.removeAttribute('hidden');
            return;
        }

        feedback.replaceChildren(notice('ok', 'Configurazione applicata. Le pipeline attive sono state riavviate.'));
        feedback.removeAttribute('hidden');
        await onChanged();
    });

    const deleteButton = el('button', { className: 'btn btn--danger', type: 'button', textContent: 'Elimina canale' });
    deleteButton.addEventListener('click', async () => {
        if (!confirm(`Eliminare definitivamente il canale "${camera.name}"?`)) return;
        await api.remove(`/api/cameras/${camera.id}`).catch(() => undefined);
        await onChanged();
        onBack();
    });

    return el('div', { className: 'stack' }, [
        form.node,
        feedback,
        el('div', { className: 'row row--between' }, [deleteButton, saveButton])
    ]);
}

function recordingTab({ api, camera, recorder }) {
    const active = recorder ? recorder.enabled : false;
    const stateChip = active ? chip('registrazione attiva', 'ok') : chip('registrazione ferma', 'warn');

    const toggle = el('button', {
        className: 'btn btn--sm',
        type: 'button',
        textContent: active ? 'Interrompi registrazione' : 'Avvia registrazione'
    });

    toggle.addEventListener('click', async () => {
        toggle.disabled = true;
        await api.post(`/api/recording/${camera.id}`, { enabled: !active }).catch(() => undefined);
        toggle.disabled = false;
        window.dispatchEvent(new CustomEvent('argus:refresh-cameras'));
    });

    return el('div', { className: 'stack' }, [
        el('div', { className: 'row row--between' }, [
            el('div', { className: 'row row--tight' }, [icon('record'), stateChip]),
            toggle
        ]),
        renderScheduleEditor({
            camera,
            api,
            onSaved: () => window.dispatchEvent(new CustomEvent('argus:refresh-cameras')),
            onCancel: () => undefined
        })
    ]);
}

function diagnosticsTab({ api, camera, onChanged }) {
    const result = el('div', {});
    const autoHost = el('div', {});

    const autoButton = el('button', { className: 'btn', type: 'button' }, [
        icon('sparkles'),
        el('span', { textContent: 'Autoconfigurazione guidata' })
    ]);

    autoButton.addEventListener('click', () => {
        autoHost.replaceChildren(renderAutoconfigure({
            api,
            camera,
            onApplied: async () => {
                autoHost.replaceChildren();
                await onChanged();
            },
            onClose: () => autoHost.replaceChildren()
        }));
        autoHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    const probeButton = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Verifica sorgente' });
    probeButton.addEventListener('click', async () => {
        probeButton.disabled = true;
        probeButton.textContent = 'Verifica in corso…';

        const outcome = await api.post(`/api/cameras/${camera.id}/probe`)
            .then((value) => ({ value }))
            .catch((error) => ({ error }));

        probeButton.disabled = false;
        probeButton.textContent = 'Verifica sorgente';

        result.replaceChildren(outcome.error
            ? notice('error', outcome.error.message)
            : probeSummary(outcome.value));
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
            autoButton,
            el('button', {
                className: 'btn',
                type: 'button',
                textContent: 'Apri in Diretta',
                onclick: () => { location.hash = '#/live'; }
            })
        ]),
        autoHost,
        result
    ]);
}

export function renderCameraDetail({ api, session, camera, recorder, onBack, onChanged }) {
    const outlet = el('div', { className: 'stack' });
    const content = el('div', { className: 'panel__body' });
    let activeTab = 'general';

    const tabButtons = new Map();

    function paint() {
        for (const [id, button] of tabButtons.entries()) {
            button.className = id === activeTab ? 'tab tab--active' : 'tab';
        }

        if (activeTab === 'general') {
            content.replaceChildren(generalTab({ api, camera, onChanged, onBack }));
            return;
        }
        if (activeTab === 'recording') {
            content.replaceChildren(recordingTab({ api, camera, recorder }));
            return;
        }
        if (activeTab === 'zones') {
            content.replaceChildren(camera.sourceKind === 'usb' && !camera.deviceId
                ? empty('Configura prima la periferica di acquisizione.')
                : renderZoneEditor({ camera, api, onSaved: () => undefined, onCancel: () => undefined }));
            return;
        }
        if (activeTab === 'analytics') {
            content.replaceChildren(renderCameraAnalytics({ api, camera, session }));
            return;
        }
        content.replaceChildren(diagnosticsTab({ api, camera, onChanged }));
    }

    const tabs = el('div', { className: 'tabs' }, TABS.map((tab) => {
        const button = el('button', { className: 'tab', type: 'button' }, [
            icon(tab.glyph),
            el('span', { textContent: tab.label })
        ]);
        button.addEventListener('click', () => {
            activeTab = tab.id;
            paint();
        });
        tabButtons.set(tab.id, button);
        return button;
    }));

    outlet.append(
        el('div', { className: 'view__head' }, [
            el('div', { className: 'stack stack--tight' }, [
                el('div', { className: 'row row--tight' }, [
                    el('h1', { className: 'view__title', textContent: camera.name }),
                    camera.enabled ? chip('attivo', 'ok') : chip('disattivo', 'warn')
                ]),
                el('span', { className: 'section__hint mono truncate', textContent: sourceLabel(camera) })
            ]),
            el('button', { className: 'btn', type: 'button', onclick: onBack }, [
                icon('close'),
                el('span', { textContent: 'Torna all elenco' })
            ])
        ]),
        el('section', { className: 'panel' }, [
            el('div', { className: 'panel__head' }, [tabs]),
            content
        ])
    );

    paint();
    return outlet;
}
