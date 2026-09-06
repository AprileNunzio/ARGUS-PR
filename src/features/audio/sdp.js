const BACKCHANNEL_TAG = 'www.onvif.org/ver20/backchannel';

export function parseSdp(text) {
    const lines = String(text ?? '').split(/\r?\n/);
    const session = { attributes: [], media: [] };
    let current = null;

    for (const line of lines) {
        if (line.startsWith('m=')) {
            current = { line: line.slice(2), attributes: [] };
            session.media.push(current);
            continue;
        }

        if (line.startsWith('a=')) {
            const attribute = line.slice(2);
            if (current) current.attributes.push(attribute);
            else session.attributes.push(attribute);
        }
    }

    return session;
}

export function attributeValue(attributes, name) {
    const prefix = `${name}:`;
    const found = attributes.find((entry) => entry.startsWith(prefix));
    return found ? found.slice(prefix.length).trim() : null;
}

export function payloadTypes(mediaLine) {
    const parts = String(mediaLine ?? '').split(/\s+/);
    return parts.slice(3).map((entry) => Number.parseInt(entry, 10)).filter(Number.isInteger);
}

export function codecTable(attributes) {
    const table = new Map();

    for (const attribute of attributes) {
        if (!attribute.startsWith('rtpmap:')) continue;
        const [payload, description] = attribute.slice(7).trim().split(/\s+/, 2);
        const code = Number.parseInt(payload, 10);
        if (!Number.isInteger(code) || !description) continue;
        const [name, clock, channels] = description.split('/');
        table.set(code, {
            payload: code,
            name: name.toUpperCase(),
            clockRate: Number.parseInt(clock, 10) || 8000,
            channels: Number.parseInt(channels, 10) || 1
        });
    }

    return table;
}

export function findBackchannel(session) {
    const audio = session.media.filter((media) => media.line.startsWith('audio'));
    if (audio.length === 0) return null;

    const tagged = audio.find((media) => media.attributes.some((entry) => entry.includes(BACKCHANNEL_TAG)));
    const sendonly = audio.find((media) => media.attributes.includes('sendonly'));
    const media = tagged ?? sendonly ?? (audio.length > 1 ? audio[audio.length - 1] : null);
    if (!media) return null;

    const codecs = codecTable(media.attributes);
    const wanted = payloadTypes(media.line)
        .map((code) => codecs.get(code) ?? (code === 0
            ? { payload: 0, name: 'PCMU', clockRate: 8000, channels: 1 }
            : code === 8 ? { payload: 8, name: 'PCMA', clockRate: 8000, channels: 1 } : null))
        .filter(Boolean);

    const codec = wanted.find((entry) => entry.name === 'PCMU')
        ?? wanted.find((entry) => entry.name === 'PCMA')
        ?? wanted[0];

    if (!codec) return null;

    return {
        control: attributeValue(media.attributes, 'control') ?? '',
        codec,
        tagged: Boolean(tagged)
    };
}

export function resolveControl(baseUrl, control) {
    if (!control || control === '*') return baseUrl;
    if (/^rtsps?:\/\//i.test(control)) return control;
    return `${baseUrl.replace(/\/+$/, '')}/${control.replace(/^\/+/, '')}`;
}
