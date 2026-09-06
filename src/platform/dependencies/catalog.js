export const FFMPEG_RELEASE = Object.freeze({
    owner: 'BtbN',
    repo: 'FFmpeg-Builds',
    tag: 'autobuild-2026-09-01-13-13',
    series: '8.1',
    checksumAsset: 'checksums.sha256'
});

const TARGETS = Object.freeze({
    'win32-x64': { slug: 'win64', extension: 'zip' },
    'linux-x64': { slug: 'linux64', extension: 'tar.xz' },
    'linux-arm64': { slug: 'linuxarm64', extension: 'tar.xz' }
});

export function targetKey() {
    return `${process.platform}-${process.arch}`;
}

export function resolveTarget() {
    return TARGETS[targetKey()] ?? null;
}

export function isDownloadSupported() {
    return resolveTarget() !== null;
}

export function assetPattern() {
    const target = resolveTarget();
    if (!target) return null;
    const series = FFMPEG_RELEASE.series.replace('.', '\\.');
    const extension = target.extension.replace('.', '\\.');
    return new RegExp(`^ffmpeg-n${series}[^\\s]*-${target.slug}-gpl-${series}\\.${extension}$`);
}

export function assetUrl(name) {
    const { owner, repo, tag } = FFMPEG_RELEASE;
    return `https://github.com/${owner}/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`;
}

export function checksumUrl() {
    return assetUrl(FFMPEG_RELEASE.checksumAsset);
}

export function selectAsset(checksumText) {
    const pattern = assetPattern();
    if (!pattern) return null;

    for (const line of checksumText.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;

        const parts = trimmed.split(/\s+/);
        if (parts.length < 2) continue;

        const name = parts[parts.length - 1].replace(/^\*/, '');
        if (pattern.test(name)) {
            return { name, sha256: parts[0].toLowerCase() };
        }
    }

    return null;
}
