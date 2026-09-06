import { securityHeader, escapeXml } from '../automation/channels/onvif_relay.js';

const TIMEOUT_MS = 8000;
const NAMESPACES = [
    'xmlns:s="http://www.w3.org/2003/05/soap-envelope"',
    'xmlns:tds="http://www.onvif.org/ver10/device/wsdl"',
    'xmlns:trt="http://www.onvif.org/ver10/media/wsdl"',
    'xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"',
    'xmlns:tt="http://www.onvif.org/ver10/schema"'
].join(' ');

export function deviceServiceUrl(host, port) {
    const trimmed = String(host ?? '').trim();
    if (trimmed.length === 0) throw new Error('Indirizzo della telecamera mancante');
    if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) throw new Error('Indirizzo della telecamera non valido');

    const parsed = Number.parseInt(port, 10);
    const resolved = Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 80;
    return `http://${trimmed}:${resolved}/onvif/device_service`;
}

export function envelope(credentials, body) {
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<s:Envelope ${NAMESPACES}>`,
        securityHeader(credentials.username, credentials.password),
        `<s:Body>${body}</s:Body>`,
        '</s:Envelope>'
    ].join('');
}

export function firstTag(xml, local) {
    const match = new RegExp(`<(?:[A-Za-z0-9]+:)?${local}[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9]+:)?${local}>`, 'i').exec(xml);
    return match ? match[1] : null;
}

export function allTags(xml, local) {
    const pattern = new RegExp(`<(?:[A-Za-z0-9]+:)?${local}\\b([^>]*)>([\\s\\S]*?)</(?:[A-Za-z0-9]+:)?${local}>`, 'gi');
    const found = [];
    let match = pattern.exec(xml);

    while (match !== null) {
        found.push({ attributes: match[1], inner: match[2] });
        match = pattern.exec(xml);
    }

    return found;
}

export function attribute(attributes, name) {
    return new RegExp(`${name}="([^"]*)"`, 'i').exec(attributes ?? '')?.[1] ?? null;
}

export async function call(url, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/soap+xml; charset=utf-8' },
        body,
        signal: controller.signal,
        redirect: 'error'
    }).catch((error) => {
        throw new Error(error.name === 'AbortError' ? 'la telecamera non ha risposto' : error.message);
    }).finally(() => clearTimeout(timer));

    const text = await response.text();

    if (!response.ok || /Fault>/i.test(text)) {
        const reason = /<[^>]*Text[^>]*>([^<]{0,160})</i.exec(text)?.[1] ?? `risposta ${response.status}`;
        throw new Error(`ONVIF: ${reason}`);
    }

    return text;
}

export async function mediaServiceUrl(url, credentials) {
    const xml = await call(url, envelope(credentials, '<tds:GetCapabilities><tds:Category>All</tds:Category></tds:GetCapabilities>'));

    const media = firstTag(xml, 'Media');
    const ptz = firstTag(xml, 'PTZ');

    return {
        media: media ? firstTag(media, 'XAddr') : null,
        ptz: ptz ? firstTag(ptz, 'XAddr') : null
    };
}

export async function listProfiles(url, credentials) {
    const xml = await call(url, envelope(credentials, '<trt:GetProfiles/>'));

    return allTags(xml, 'Profiles').map(({ attributes, inner }) => ({
        token: attribute(attributes, 'token'),
        name: firstTag(inner, 'Name'),
        hasPtz: /PTZConfiguration/i.test(inner)
    })).filter((profile) => profile.token);
}

export async function nodeCapabilities(url, credentials) {
    const xml = await call(url, envelope(credentials, '<tptz:GetNodes/>')).catch(() => '');

    return {
        continuousPanTilt: /ContinuousPanTiltVelocitySpace/i.test(xml),
        continuousZoom: /ContinuousZoomVelocitySpace/i.test(xml),
        presets: /MaximumNumberOfPresets/i.test(xml),
        home: /HomeSupported>\s*true/i.test(xml)
    };
}

export function continuousMoveBody(token, pan, tilt, zoom) {
    const velocity = [
        '<tptz:Velocity>',
        `<tt:PanTilt x="${pan}" y="${tilt}" xmlns:tt="http://www.onvif.org/ver10/schema"/>`,
        `<tt:Zoom x="${zoom}" xmlns:tt="http://www.onvif.org/ver10/schema"/>`,
        '</tptz:Velocity>'
    ].join('');

    return `<tptz:ContinuousMove><tptz:ProfileToken>${escapeXml(token)}</tptz:ProfileToken>${velocity}</tptz:ContinuousMove>`;
}

export function stopBody(token) {
    return [
        '<tptz:Stop>',
        `<tptz:ProfileToken>${escapeXml(token)}</tptz:ProfileToken>`,
        '<tptz:PanTilt>true</tptz:PanTilt>',
        '<tptz:Zoom>true</tptz:Zoom>',
        '</tptz:Stop>'
    ].join('');
}

export function homeBody(token) {
    return `<tptz:GotoHomePosition><tptz:ProfileToken>${escapeXml(token)}</tptz:ProfileToken></tptz:GotoHomePosition>`;
}

export function presetsBody(token) {
    return `<tptz:GetPresets><tptz:ProfileToken>${escapeXml(token)}</tptz:ProfileToken></tptz:GetPresets>`;
}

export function gotoPresetBody(token, preset) {
    return [
        '<tptz:GotoPreset>',
        `<tptz:ProfileToken>${escapeXml(token)}</tptz:ProfileToken>`,
        `<tptz:PresetToken>${escapeXml(preset)}</tptz:PresetToken>`,
        '</tptz:GotoPreset>'
    ].join('');
}

export function setPresetBody(token, name) {
    return [
        '<tptz:SetPreset>',
        `<tptz:ProfileToken>${escapeXml(token)}</tptz:ProfileToken>`,
        `<tptz:PresetName>${escapeXml(name)}</tptz:PresetName>`,
        '</tptz:SetPreset>'
    ].join('');
}
