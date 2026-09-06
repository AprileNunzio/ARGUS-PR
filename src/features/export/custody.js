import crypto from 'node:crypto';

export const MANIFEST_VERSION = 1;

function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;

    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

export function canonicalJson(value) {
    return canonical(value);
}

export function digest(value) {
    return crypto.createHash('sha256').update(canonical(value)).digest('hex');
}

export function chainSources(sources) {
    let previous = '0'.repeat(64);

    return sources.map((source, index) => {
        const link = crypto
            .createHash('sha256')
            .update(previous)
            .update(String(index))
            .update(source.sha256)
            .update(String(source.startedAt))
            .update(String(source.bytes))
            .digest('hex');

        previous = link;

        return { ...source, position: index, link };
    });
}

export function chainRoot(chained) {
    if (chained.length === 0) return '0'.repeat(64);
    return chained[chained.length - 1].link;
}

export function buildManifest(input) {
    const sources = chainSources(input.sources);

    const body = {
        manifestVersion: MANIFEST_VERSION,
        exportId: input.exportId,
        product: input.product,
        camera: { id: input.cameraId, name: input.cameraName },
        range: { fromMs: input.fromMs, toMs: input.toMs },
        requestedBy: { userId: input.actorId, username: input.actorName, address: input.address },
        requestedAt: input.requestedAt,
        completedAt: input.completedAt,
        reason: input.reason,
        output: {
            file: input.outputName,
            bytes: input.outputBytes,
            sha256: input.outputSha256,
            container: 'mp4',
            reencoded: false
        },
        sources: sources.map((source) => ({
            position: source.position,
            file: source.file,
            startedAt: source.startedAt,
            durationMs: source.durationMs,
            bytes: source.bytes,
            sha256: source.sha256,
            verifiedSha256: source.verifiedSha256,
            intact: source.sha256 === source.verifiedSha256,
            link: source.link
        })),
        chainRoot: chainRoot(sources),
        sourcesIntact: sources.every((source) => source.sha256 === source.verifiedSha256)
    };

    return { ...body, manifestSha256: digest(body) };
}

export function sealManifest(manifest, key) {
    const { manifestSha256, ...body } = manifest;

    return crypto
        .createHmac('sha256', key)
        .update(canonical(body))
        .update(manifestSha256)
        .digest('hex');
}

export function verifyManifest(manifest, seal, key) {
    const { manifestSha256, ...body } = manifest;
    const recomputed = digest(body);

    const problems = [];
    if (recomputed !== manifestSha256) problems.push('Il manifesto non corrisponde al proprio hash');

    const expected = sealManifest(manifest, key);
    const sealOk = seal.length === expected.length
        && crypto.timingSafeEqual(Buffer.from(seal, 'utf8'), Buffer.from(expected, 'utf8'));

    if (!sealOk) problems.push('Il sigillo non e\' valido per questa installazione');

    const rebuilt = chainSources(manifest.sources.map((source) => ({
        sha256: source.sha256,
        startedAt: source.startedAt,
        bytes: source.bytes
    })));

    if (chainRoot(rebuilt) !== manifest.chainRoot) problems.push('La catena dei segmenti e\' stata alterata');

    return { valid: problems.length === 0, problems };
}
