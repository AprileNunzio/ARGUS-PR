import { el, chip, notice, pageHead } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, metricTile } from '/assets/ui.js';
import { go } from '/assets/router.js';
import { setBreadcrumbDetail } from '/assets/shell.js';
import { renderScreensApp } from './apps/screens_app.js';
import { renderTilesApp } from './apps/tiles_app.js';
import { renderCamerasApp } from './apps/cameras_app.js';
import { renderAppearanceApp } from './apps/appearance_app.js';
import { renderVisionApp } from './apps/vision_app.js';

const SUB_APPS = [
    {
        id: 'screens',
        title: 'Schermi e uscite',
        desc: 'Un profilo per ogni uscita video: HDMI, DisplayPort, VGA e muro web, ognuno con la propria griglia',
        icon: 'monitor',
        tone: 'cyan',
        render: renderScreensApp
    },
    {
        id: 'tiles',
        title: 'Assegnazione riquadri',
        desc: 'Disponi le telecamere sul display di uno schermo: automatico, canale fisso oppure riquadro vuoto',
        icon: 'crop',
        tone: 'purple',
        render: renderTilesApp
    },
    {
        id: 'cameras',
        title: 'Telecamere e qualita',
        desc: 'Escludi i canali dal muro e scegli Main HD o Sub SD per ognuno',
        icon: 'camera',
        tone: 'emerald',
        render: renderCamerasApp
    },
    {
        id: 'appearance',
        title: 'Aspetto e orologio',
        desc: 'Accendi o spegni ogni elemento della barra di stato e dei riquadri, e imposta il formato dell orologio',
        icon: 'sliders',
        tone: 'amber',
        render: renderAppearanceApp
    },
    {
        id: 'ai',
        title: 'Riconoscimento oggetti',
        desc: 'Contorni AI sul video, algoritmi disponibili e telemetria del motore di visione',
        icon: 'eye',
        tone: 'blue',
        render: renderVisionApp
    }
];

async function loadContext(api) {
    const payload = await api.get('/api/wall/config').catch((error) => ({ failure: error }));
    return payload;
}

function hubCard(entry, onOpen) {
    return el('button', {
        type: 'button',
        className: `subapp-card subapp-card--${entry.tone} rise`,
        onclick: () => onOpen(entry.id)
    }, [
        el('span', { className: `subapp-card__icon subapp-card__icon--${entry.tone}` }, [icon(entry.icon, { className: 'icon--lg' })]),
        el('span', { className: 'subapp-card__body' }, [
            el('strong', { className: 'subapp-card__title', textContent: entry.title }),
            el('span', { className: 'subapp-card__desc', textContent: entry.desc })
        ]),
        icon('chevronRight')
    ]);
}

export async function renderWallSettings({ api, params = [] }) {
    const root = el('div', { className: 'view view--tight wall-settings-view' });
    const payload = await loadContext(api);

    if (payload.failure) {
        root.replaceChildren(
            pageHead({ title: 'Regia & Configurazione Muro', hint: 'Schermi, riquadri, qualita e aspetto del muro video' }),
            notice('error', `Impossibile caricare la configurazione del muro: ${payload.failure.message}`)
        );
        return root;
    }

    const requested = params[0] ?? null;
    const app = SUB_APPS.find((entry) => entry.id === requested);

    if (app) {
        setBreadcrumbDetail(`Regia · ${app.title}`);

        const view = await app.render({
            api,
            payload,
            params: params.slice(1),
            onBack: () => go('wall-settings')
        });

        root.replaceChildren(
            pageHead({
                title: app.title,
                hint: app.desc,
                back: el('button', {
                    className: 'page-back',
                    type: 'button',
                    onclick: () => go('wall-settings')
                }, [icon('chevronLeft'), el('span', { textContent: 'Regia del muro' })])
            }),
            view
        );

        return root;
    }

    setBreadcrumbDetail('Regia del muro');

    const screens = payload.config.screens ?? [];
    const cameras = payload.cameras ?? [];
    const connected = (payload.displays ?? []).filter((display) => display.connected).length;

    root.replaceChildren(
        pageHead({
            title: 'Regia & Configurazione Muro',
            hint: 'Ogni sezione si apre come pagina indipendente: configuri una cosa alla volta, senza caricare tutto insieme',
            actions: [
                el('button', {
                    className: 'btn',
                    type: 'button',
                    onclick: () => window.open('/wall', '_blank')
                }, [icon('monitor'), el('span', { textContent: 'Apri Muro Video' })])
            ]
        }),
        el('div', { className: 'grid grid--stats' }, [
            metricTile({ label: 'Schermi configurati', value: String(screens.length), iconName: 'monitor', tone: 'cyan' }),
            metricTile({ label: 'Uscite collegate', value: String(connected), hint: 'Monitor rilevati dal kernel', iconName: 'server', tone: 'blue' }),
            metricTile({ label: 'Telecamere disponibili', value: String(cameras.filter((camera) => camera.enabled).length), iconName: 'camera', tone: 'emerald' }),
            metricTile({
                label: 'Riconoscimento AI',
                value: payload.config.overlay?.enabled ? 'Attivo' : 'Spento',
                iconName: 'eye',
                tone: payload.config.overlay?.enabled ? 'purple' : 'amber'
            })
        ]),
        card({
            title: 'Sezioni della regia',
            subtitle: 'Ognuna ha il proprio indirizzo: puoi aprirla in una scheda separata o condividerne il collegamento',
            iconName: 'apps',
            tone: 'blue',
            badge: chip(`${SUB_APPS.length} sezioni`, 'info'),
            body: [
                el('div', { className: 'subapp-grid' }, SUB_APPS.map((entry) => hubCard(entry, (id) => go('wall-settings', id))))
            ]
        })
    );

    return root;
}
