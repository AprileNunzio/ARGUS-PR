export const EngineStatus = Object.freeze({ READY: 'ready', PLANNED: 'planned' });

export const Capability = Object.freeze({
    MOTION: 'motion',
    PERSON: 'person',
    VEHICLE: 'vehicle',
    ANIMAL: 'animal',
    FACE_DETECT: 'face_detect',
    FACE_RECOGNIZE: 'face_recognize',
    PLATE: 'plate'
});

export const CAPABILITIES = Object.freeze([
    {
        id: Capability.MOTION,
        label: 'Movimento',
        hint: 'Confronto fra fotogrammi, senza rete neurale. E il filtro che sveglia tutto il resto.',
        task: 'motion',
        defaultEnabled: true,
        defaultThreshold: 0.25,
        classes: []
    },
    {
        id: Capability.PERSON,
        label: 'Persone',
        hint: 'Rilevamento di persone nell inquadratura.',
        task: 'objects',
        defaultEnabled: false,
        defaultThreshold: 0.4,
        classes: ['person']
    },
    {
        id: Capability.VEHICLE,
        label: 'Veicoli',
        hint: 'Auto, furgoni, autobus, moto, biciclette, treni, imbarcazioni e aeromobili.',
        task: 'objects',
        defaultEnabled: false,
        defaultThreshold: 0.4,
        classes: ['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'train', 'boat', 'airplane']
    },
    {
        id: Capability.ANIMAL,
        label: 'Animali',
        hint: 'Cani, gatti, uccelli e animali di taglia grande.',
        task: 'objects',
        defaultEnabled: false,
        defaultThreshold: 0.45,
        classes: ['dog', 'cat', 'bird', 'horse', 'sheep', 'cow', 'bear', 'elephant', 'zebra', 'giraffe']
    },
    {
        id: Capability.FACE_DETECT,
        label: 'Volti',
        hint: 'Individua i volti senza identificarli.',
        task: 'faces',
        defaultEnabled: false,
        defaultThreshold: 0.6,
        classes: ['face']
    },
    {
        id: Capability.FACE_RECOGNIZE,
        label: 'Riconoscimento facciale',
        hint: 'Confronta i volti con le persone iscritte. Dato biometrico: soggetto al GDPR.',
        task: 'faces',
        requires: Capability.FACE_DETECT,
        sensitive: true,
        defaultEnabled: false,
        defaultThreshold: 0.363,
        classes: []
    },
    {
        id: Capability.PLATE,
        label: 'Targhe (ANPR)',
        hint: 'Legge le targhe dei veicoli e alimenta il controllo accessi.',
        task: 'plates',
        requires: Capability.VEHICLE,
        defaultEnabled: false,
        defaultThreshold: 0.35,
        classes: ['plate']
    }
]);

export const ENGINES = Object.freeze([
    {
        id: 'pixel_ema',
        capability: Capability.MOTION,
        label: 'Differenza pixel a media mobile',
        hint: 'Modello di sfondo adattivo su fotogrammi 160x90. Costo trascurabile, gia integrato.',
        status: EngineStatus.READY,
        runtime: 'native',
        cost: 1,
        models: [],
        license: 'MIT'
    },
    {
        id: 'onvif_motion',
        capability: Capability.MOTION,
        label: 'Rilevamento della telecamera (ONVIF)',
        hint: 'Usa gli eventi di movimento generati dalla telecamera. Richiede il ponte eventi ONVIF.',
        status: EngineStatus.PLANNED,
        runtime: 'edge',
        cost: 0,
        models: [],
        license: 'n/d'
    },
    {
        id: 'yolox_nano',
        capability: 'objects',
        label: 'YOLOX-nano',
        hint: 'Rete leggera, sotto i 30 ms per fotogramma su CPU moderne. Scelta predefinita.',
        status: EngineStatus.READY,
        runtime: 'python',
        cost: 2,
        models: ['yolox_nano'],
        license: 'Apache-2.0'
    },
    {
        id: 'yolox_tiny',
        capability: 'objects',
        label: 'YOLOX-tiny',
        hint: 'Piu accurata di nano su soggetti piccoli e lontani, circa tre volte il costo.',
        status: EngineStatus.READY,
        runtime: 'python',
        cost: 3,
        models: ['yolox_tiny'],
        license: 'Apache-2.0'
    },
    {
        id: 'edge_objects',
        capability: 'objects',
        label: 'Analitica di bordo della telecamera',
        hint: 'Riceve gli eventi che la telecamera genera da sola. Costo di CPU nullo. Richiede il ponte eventi ONVIF.',
        status: EngineStatus.PLANNED,
        runtime: 'edge',
        cost: 0,
        models: [],
        license: 'n/d'
    },
    {
        id: 'yunet',
        capability: 'face_detect',
        label: 'YuNet',
        hint: 'Rilevatore di volti di OpenCV, 340 kB, con cinque punti di riferimento per l allineamento.',
        status: EngineStatus.READY,
        runtime: 'python',
        cost: 1,
        models: ['face_detection_yunet'],
        license: 'Apache-2.0'
    },
    {
        id: 'scrfd_500m',
        capability: 'face_detect',
        label: 'SCRFD-500m',
        hint: 'Piu robusto su volti piccoli e pose estreme.',
        status: EngineStatus.PLANNED,
        runtime: 'python',
        cost: 2,
        models: [],
        license: 'Apache-2.0'
    },
    {
        id: 'sface',
        capability: 'face_recognize',
        label: 'SFace',
        hint: 'Vettore a 128 dimensioni, soglia di somiglianza documentata a 0.363.',
        status: EngineStatus.READY,
        runtime: 'python',
        cost: 2,
        models: ['face_recognition_sface'],
        license: 'Apache-2.0'
    },
    {
        id: 'mobilefacenet',
        capability: 'face_recognize',
        label: 'MobileFaceNet (ArcFace)',
        hint: 'Alternativa piu leggera, richiede nuova taratura della soglia.',
        status: EngineStatus.PLANNED,
        runtime: 'python',
        cost: 1,
        models: [],
        license: 'MIT'
    },
    {
        id: 'plate_template',
        capability: 'plate',
        label: 'Ricerca morfologica e confronto sagome',
        hint: 'Individua la targa dentro il veicolo e legge i caratteri per confronto. Nessun modello da scaricare.',
        status: EngineStatus.READY,
        runtime: 'python',
        cost: 1,
        models: [],
        license: 'MIT'
    },
    {
        id: 'plate_crnn',
        capability: 'plate',
        label: 'CRNN EN',
        hint: 'Lettura con rete neurale sul ritaglio della targa. Piu accurata sulle riprese oblique.',
        status: EngineStatus.READY,
        runtime: 'python',
        cost: 3,
        models: ['text_recognition_crnn_en'],
        license: 'Apache-2.0'
    },
    {
        id: 'plate_paddleocr',
        capability: 'plate',
        label: 'PaddleOCR',
        hint: 'Riconoscimento testo generalista, il piu accurato in condizioni difficili.',
        status: EngineStatus.PLANNED,
        runtime: 'python',
        cost: 4,
        models: [],
        license: 'Apache-2.0'
    },
    {
        id: 'edge_anpr',
        capability: 'plate',
        label: 'ANPR di bordo della telecamera',
        hint: 'Molte Hikvision e Dahua leggono gia le targhe in hardware. Richiede il ponte eventi ONVIF.',
        status: EngineStatus.PLANNED,
        runtime: 'edge',
        cost: 0,
        models: [],
        license: 'n/d'
    }
]);

const ENGINE_SLOTS = Object.freeze({
    [Capability.MOTION]: Capability.MOTION,
    [Capability.PERSON]: 'objects',
    [Capability.VEHICLE]: 'objects',
    [Capability.ANIMAL]: 'objects',
    [Capability.FACE_DETECT]: 'face_detect',
    [Capability.FACE_RECOGNIZE]: 'face_recognize',
    [Capability.PLATE]: 'plate'
});

const DEFAULT_ENGINES = Object.freeze({
    [Capability.MOTION]: 'pixel_ema',
    [Capability.PERSON]: 'yolox_nano',
    [Capability.VEHICLE]: 'yolox_nano',
    [Capability.ANIMAL]: 'yolox_nano',
    [Capability.FACE_DETECT]: 'yunet',
    [Capability.FACE_RECOGNIZE]: 'sface',
    [Capability.PLATE]: 'plate_template'
});

export function capabilityIds() {
    return CAPABILITIES.map((entry) => entry.id);
}

export function findCapability(id) {
    return CAPABILITIES.find((entry) => entry.id === id) ?? null;
}

export function engineSlot(capabilityId) {
    return ENGINE_SLOTS[capabilityId] ?? null;
}

export function defaultEngineFor(capabilityId) {
    return DEFAULT_ENGINES[capabilityId] ?? null;
}

export function enginesFor(capabilityId) {
    const slot = engineSlot(capabilityId);
    return ENGINES.filter((engine) => engine.capability === slot);
}

export function findEngine(engineId) {
    return ENGINES.find((engine) => engine.id === engineId) ?? null;
}

export function isEngineAllowed(capabilityId, engineId) {
    return enginesFor(capabilityId).some((engine) => engine.id === engineId && engine.status === EngineStatus.READY);
}

export function modelsRequiredBy(engineIds) {
    const required = new Set();
    for (const id of engineIds) {
        const engine = findEngine(id);
        if (!engine) continue;
        for (const model of engine.models) required.add(model);
    }
    return [...required];
}

export function catalogView() {
    return {
        capabilities: CAPABILITIES.map((entry) => ({
            ...entry,
            defaultEngine: defaultEngineFor(entry.id),
            engines: enginesFor(entry.id)
        }))
    };
}
