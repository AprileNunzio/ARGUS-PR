import { validationError } from '../../kernel/errors.js';
import {
    requireString,
    optionalString,
    optionalPort,
    requireEnum,
    requireBool,
    requireStreamUrl,
    optionalStreamUrl,
    requireNumberRange
} from '../../security/guards.js';
import { SOURCE_KINDS, INPUT_FORMATS, isLocalKind, requireDeviceId } from './camera_input.js';

const TRANSPORTS = Object.freeze(['tcp', 'udp']);
const HWACCELS = Object.freeze(['auto', 'none', 'cuda', 'qsv', 'd3d11va', 'vaapi', 'videotoolbox', 'amf']);

function optionalInteger(value, field, min, max) {
    if (value === undefined || value === null || value === '') return null;
    return Math.trunc(requireNumberRange(value, field, min, max));
}

function readNetworkFields(body, partial) {
    const requireMain = !partial || body.mainStreamUrl !== undefined;
    return {
        mainStreamUrl: requireMain ? requireStreamUrl(body.mainStreamUrl, 'Main stream URL') : undefined,
        subStreamUrl: body.subStreamUrl === undefined ? undefined : optionalStreamUrl(body.subStreamUrl, 'Sub stream URL'),
        transport: body.transport === undefined ? (partial ? undefined : 'tcp') : requireEnum(body.transport, 'Transport', TRANSPORTS),
        host: body.host === undefined ? undefined : optionalString(body.host, 'Host', { max: 253 }),
        port: body.port === undefined ? undefined : optionalPort(body.port, 'Port'),
        onvifPort: body.onvifPort === undefined ? undefined : optionalPort(body.onvifPort, 'ONVIF port'),
        username: body.username === undefined ? undefined : optionalString(body.username, 'Username', { max: 120 }),
        password: body.password === undefined ? undefined : optionalString(body.password, 'Password', { max: 200 })
    };
}

function readLocalFields(body, partial) {
    const requireDevice = !partial || body.deviceId !== undefined;
    return {
        deviceId: requireDevice ? requireDeviceId(body.deviceId, 'Capture device') : undefined,
        mainStreamUrl: partial ? undefined : null,
        subStreamUrl: partial ? undefined : null,
        username: partial ? undefined : null,
        password: partial ? undefined : null
    };
}

export function readCameraInput(body, options = {}) {
    if (body === null || typeof body !== 'object') throw validationError('Camera payload is missing');

    const partial = options.partial === true;
    const kind = body.sourceKind === undefined
        ? (partial ? options.currentKind ?? null : 'rtsp')
        : requireEnum(body.sourceKind, 'Source kind', SOURCE_KINDS);

    const local = kind !== null && isLocalKind(kind);

    const payload = {
        name: partial && body.name === undefined ? undefined : requireString(body.name, 'Name', { max: 120 }),
        sourceKind: body.sourceKind === undefined ? undefined : kind,
        enabled: body.enabled === undefined ? undefined : requireBool(body.enabled),
        audioEnabled: body.audioEnabled === undefined ? undefined : requireBool(body.audioEnabled),
        manufacturer: body.manufacturer === undefined ? undefined : optionalString(body.manufacturer, 'Manufacturer', { max: 120 }),
        model: body.model === undefined ? undefined : optionalString(body.model, 'Model', { max: 120 }),
        location: body.location === undefined ? undefined : optionalString(body.location, 'Location', { max: 160 }),
        group: body.group === undefined ? undefined : optionalString(body.group, 'Group', { max: 80 }),
        notes: body.notes === undefined ? undefined : optionalString(body.notes, 'Notes', { max: 500 }),
        retentionDays: body.retentionDays === undefined ? undefined : optionalInteger(body.retentionDays, 'Retention days', 1, 3650),
        hwaccel: body.hwaccel === undefined ? undefined : (body.hwaccel === null || body.hwaccel === '' ? null : requireEnum(body.hwaccel, 'Hardware acceleration', HWACCELS)),
        inputFormat: body.inputFormat === undefined ? undefined : (body.inputFormat === null || body.inputFormat === '' ? null : requireEnum(body.inputFormat, 'Input format', INPUT_FORMATS)),
        captureWidth: body.captureWidth === undefined ? undefined : optionalInteger(body.captureWidth, 'Capture width', 16, 7680),
        captureHeight: body.captureHeight === undefined ? undefined : optionalInteger(body.captureHeight, 'Capture height', 16, 4320),
        captureFps: body.captureFps === undefined ? undefined : optionalInteger(body.captureFps, 'Capture frame rate', 1, 240),
        storagePoolId: body.storagePoolId === undefined ? undefined : (body.storagePoolId === null || body.storagePoolId === '' ? null : optionalString(body.storagePoolId, 'Storage pool', { max: 64 })),
        ...(local ? readLocalFields(body, partial) : readNetworkFields(body, partial))
    };

    if ((payload.captureWidth === null) !== (payload.captureHeight === null)
        && payload.captureWidth !== undefined && payload.captureHeight !== undefined) {
        throw validationError('Capture width and height must be set together');
    }

    for (const key of Object.keys(payload)) {
        if (payload[key] === undefined) delete payload[key];
    }

    return payload;
}
