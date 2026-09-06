const RELEASE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;

export function isReleaseTag(value) {
    return RELEASE_TAG.test(String(value ?? ''));
}

export function parseVersion(value) {
    const text = String(value ?? '').trim().replace(/^v/, '');
    const match = VERSION.exec(text);
    if (!match) return null;

    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease: match[4] ?? null
    };
}

function comparePrerelease(left, right) {
    if (left === right) return 0;
    if (left === null) return 1;
    if (right === null) return -1;

    const a = left.split('.');
    const b = right.split('.');

    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
        const x = a[index];
        const y = b[index];
        if (x === undefined) return -1;
        if (y === undefined) return 1;
        if (x === y) continue;

        const nx = /^\d+$/.test(x);
        const ny = /^\d+$/.test(y);
        if (nx && ny) return Number(x) < Number(y) ? -1 : 1;
        if (nx) return -1;
        if (ny) return 1;
        return x < y ? -1 : 1;
    }

    return 0;
}

export function compareVersions(left, right) {
    const a = parseVersion(left);
    const b = parseVersion(right);

    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;

    for (const field of ['major', 'minor', 'patch']) {
        if (a[field] !== b[field]) return a[field] < b[field] ? -1 : 1;
    }

    return comparePrerelease(a.prerelease, b.prerelease);
}

export function isNewer(candidate, current) {
    return compareVersions(candidate, current) > 0;
}

export function latestRelease(tags) {
    const releases = tags.filter(isReleaseTag);
    if (releases.length === 0) return null;
    return releases.reduce((best, tag) => (compareVersions(tag, best) > 0 ? tag : best));
}
