import { getSetting, setSetting } from '../settings/settings_repository.js';
import { validationError } from '../../kernel/errors.js';

const STORAGE_KEY = 'wall.config';

export const LAYOUT_PRESETS = Object.freeze(['auto', '1', '4', '9', '16', '25', '36', '64']);
export const STREAM_QUALITIES = Object.freeze(['main', 'sub']);
export const CLOCK_FORMATS = Object.freeze(['24h', '12h']);
export const DATE_STYLES = Object.freeze(['none', 'short', 'long']);
export const OVERLAY_STYLES = Object.freeze(['solid', 'corner', 'glow']);

export const STATUSBAR_PARTS = Object.freeze([
    { id: 'brand', label: 'Marchio ARGUS-PR', hint: 'Logo e nome del software a sinistra' },
    { id: 'endpoint', label: 'Indirizzo IP del server', hint: 'Utile in fase di installazione, superfluo su un muro in esercizio' },
    { id: 'sync', label: 'Stato sincronizzazione', hint: 'Pallino che segnala se la configurazione arriva in tempo reale' },
    { id: 'layout', label: 'Pulsanti della griglia', hint: 'Selettore rapido del numero di riquadri' },
    { id: 'channels', label: 'Numero di canali', hint: 'Quante telecamere sono attive' },
    { id: 'recording', label: 'Canali in registrazione', hint: 'Quante telecamere stanno registrando' },
    { id: 'outputs', label: 'Uscita video', hint: 'Monitor collegati alle uscite hardware' },
    { id: 'cpu', label: 'Carico CPU', hint: 'Percentuale di occupazione del processore' },
    { id: 'ram', label: 'Memoria occupata', hint: 'Percentuale di RAM in uso' },
    { id: 'gpu', label: 'Acceleratore grafico', hint: 'Etichetta della GPU rilevata' },
    { id: 'version', label: 'Versione installata', hint: 'Numero di versione di ARGUS-PR' },
    { id: 'clock', label: 'Orologio', hint: 'Data e ora nell angolo destro' }
]);

export const TILE_PARTS = Object.freeze([
    { id: 'name', label: 'Nome della telecamera', hint: 'Etichetta in alto a sinistra su ogni riquadro' },
    { id: 'state', label: 'Pallino di stato', hint: 'Verde in diretta, giallo in connessione, rosso non disponibile' },
    { id: 'quality', label: 'Indicatore HD o SD', hint: 'Segnala se il riquadro riceve il flusso principale o secondario' },
    { id: 'tools', label: 'Comandi al passaggio del mouse', hint: 'Barra con playback, foto, registrazione e altre azioni' },
    { id: 'placeholder', label: 'Marchio sui riquadri liberi', hint: 'Logo e firma negli spazi senza telecamera' }
]);
export const OVERLAY_CLASSES = Object.freeze([
    'person', 'vehicle', 'car', 'truck', 'bus', 'motorcycle', 'bicycle',
    'train', 'boat', 'airplane',
    'animal', 'dog', 'cat', 'bird', 'horse', 'sheep', 'cow', 'bear',
    'elephant', 'zebra', 'giraffe',
    'backpack', 'handbag', 'suitcase',
    'face', 'plate'
]);

const MAX_TILES = 64;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const OUTPUT_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

export const DEFAULT_WALL_CONFIG = Object.freeze({
    layout: 'auto',
    defaultQuality: 'sub',
    rotateSeconds: 0,
    showOfflineTiles: true,
    tiles: [],
    excluded: [],
    quality: {},
    outputs: [],
    primaryOutput: null,
    clock: Object.freeze({
        format: '24h',
        showSeconds: true,
        dateStyle: 'short',
        showTimezone: false
    }),
    statusbar: Object.freeze({
        visible: true,
        brand: true,
        endpoint: true,
        sync: true,
        layout: true,
        channels: true,
        recording: true,
        outputs: true,
        cpu: true,
        ram: true,
        gpu: true,
        version: true,
        clock: true
    }),
    tile: Object.freeze({
        name: true,
        state: true,
        quality: true,
        tools: true,
        placeholder: true
    }),
    overlay: Object.freeze({
        enabled: false,
        classes: Object.freeze(['person', 'car', 'truck', 'bus', 'motorcycle', 'bicycle', 'dog', 'cat']),
        minConfidence: 0.45,
        showLabel: true,
        showConfidence: true,
        showTrackId: false,
        style: 'corner',
        holdMs: 1500
    })
});

function cleanId(value) {
    return typeof value === 'string' && ID_PATTERN.test(value) ? value : null;
}

function cleanOutput(value) {
    return typeof value === 'string' && OUTPUT_PATTERN.test(value) ? value : null;
}

function sanitiseTiles(raw) {
    if (!Array.isArray(raw)) return [];

    const seen = new Set();
    const tiles = [];

    for (const entry of raw.slice(0, MAX_TILES)) {
        if (!entry || typeof entry !== 'object') continue;

        const index = Number.parseInt(entry.index, 10);
        const cameraId = cleanId(entry.cameraId);
        if (!Number.isInteger(index) || index < 0 || index >= MAX_TILES) continue;
        if (!cameraId || seen.has(index)) continue;

        seen.add(index);
        tiles.push({ index, cameraId });
    }

    return tiles.sort((a, b) => a.index - b.index);
}

function sanitiseQuality(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

    const map = {};
    for (const [key, value] of Object.entries(raw).slice(0, MAX_TILES)) {
        const cameraId = cleanId(key);
        if (cameraId && STREAM_QUALITIES.includes(value)) map[cameraId] = value;
    }
    return map;
}

function sanitiseOutputs(raw) {
    if (!Array.isArray(raw)) return [];

    const outputs = [];
    for (const entry of raw.slice(0, 16)) {
        if (!entry || typeof entry !== 'object') continue;
        const id = cleanOutput(entry.id);
        if (!id || outputs.some((item) => item.id === id)) continue;
        outputs.push({ id, enabled: entry.enabled !== false });
    }
    return outputs;
}

function sanitiseClock(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
        format: CLOCK_FORMATS.includes(source.format) ? source.format : DEFAULT_WALL_CONFIG.clock.format,
        showSeconds: source.showSeconds !== false,
        dateStyle: DATE_STYLES.includes(source.dateStyle) ? source.dateStyle : DEFAULT_WALL_CONFIG.clock.dateStyle,
        showTimezone: source.showTimezone === true
    };
}

function sanitiseParts(raw, definitions, extra = []) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const result = {};

    for (const key of extra) result[key] = source[key] !== false;
    for (const entry of definitions) result[entry.id] = source[entry.id] !== false;

    return result;
}

function sanitiseOverlay(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const confidence = Number(source.minConfidence);
    const hold = Number.parseInt(source.holdMs, 10);

    const classes = Array.isArray(source.classes)
        ? [...new Set(source.classes.filter((entry) => OVERLAY_CLASSES.includes(entry)))]
        : [...DEFAULT_WALL_CONFIG.overlay.classes];

    return {
        enabled: source.enabled === true,
        classes,
        minConfidence: Number.isFinite(confidence) && confidence >= 0.05 && confidence <= 0.95
            ? Math.round(confidence * 100) / 100
            : DEFAULT_WALL_CONFIG.overlay.minConfidence,
        showLabel: source.showLabel !== false,
        showConfidence: source.showConfidence !== false,
        showTrackId: source.showTrackId === true,
        style: OVERLAY_STYLES.includes(source.style) ? source.style : DEFAULT_WALL_CONFIG.overlay.style,
        holdMs: Number.isInteger(hold) && hold >= 200 && hold <= 10000 ? hold : DEFAULT_WALL_CONFIG.overlay.holdMs
    };
}

export function sanitiseWallConfig(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const rotate = Number.parseInt(source.rotateSeconds, 10);

    return {
        layout: LAYOUT_PRESETS.includes(source.layout) ? source.layout : DEFAULT_WALL_CONFIG.layout,
        defaultQuality: STREAM_QUALITIES.includes(source.defaultQuality) ? source.defaultQuality : DEFAULT_WALL_CONFIG.defaultQuality,
        rotateSeconds: Number.isInteger(rotate) && rotate >= 0 && rotate <= 3600 ? rotate : 0,
        showOfflineTiles: source.showOfflineTiles !== false,
        tiles: sanitiseTiles(source.tiles),
        excluded: Array.isArray(source.excluded)
            ? [...new Set(source.excluded.map(cleanId).filter(Boolean))].slice(0, MAX_TILES)
            : [],
        quality: sanitiseQuality(source.quality),
        outputs: sanitiseOutputs(source.outputs),
        primaryOutput: cleanOutput(source.primaryOutput),
        clock: sanitiseClock(source.clock),
        statusbar: sanitiseParts(source.statusbar, STATUSBAR_PARTS, ['visible']),
        tile: sanitiseParts(source.tile, TILE_PARTS),
        overlay: sanitiseOverlay(source.overlay)
    };
}

export function readWallConfig() {
    return sanitiseWallConfig(getSetting(STORAGE_KEY, null));
}

export function saveWallConfig(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw validationError('Configurazione del muro video non valida');
    }

    const next = sanitiseWallConfig({ ...readWallConfig(), ...patch });
    setSetting(STORAGE_KEY, next);
    return next;
}

export function qualityForCamera(config, cameraId) {
    return config.quality[cameraId] ?? config.defaultQuality;
}

export function wallCameraPlan(config, cameras) {
    const active = cameras.filter((camera) => camera.enabled && !config.excluded.includes(camera.id));
    const byId = new Map(active.map((camera) => [camera.id, camera]));
    const placed = new Map();

    for (const tile of config.tiles) {
        const camera = byId.get(tile.cameraId);
        if (camera && !placed.has(tile.index)) placed.set(tile.index, camera);
    }

    const assignedIds = new Set([...placed.values()].map((camera) => camera.id));
    const remaining = active.filter((camera) => !assignedIds.has(camera.id));

    let cursor = 0;
    for (const camera of remaining) {
        while (placed.has(cursor)) cursor += 1;
        if (cursor >= MAX_TILES) break;
        placed.set(cursor, camera);
    }

    return [...placed.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([index, camera]) => ({
            index,
            id: camera.id,
            name: camera.name,
            quality: qualityForCamera(config, camera.id)
        }));
}
