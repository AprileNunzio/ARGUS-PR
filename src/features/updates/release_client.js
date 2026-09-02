import { AppError, ErrorCode } from '../../kernel/errors.js';
import { isReleaseTag } from './semver.js';

const API_ROOT = 'https://api.github.com';
const OWNER = 'AprileNunzio';
const REPO = 'ARGUS-PR';
const TIMEOUT_MS = 12000;
const MAX_BODY_BYTES = 512 * 1024;

function endpoint(path) {
    return `${API_ROOT}/repos/${OWNER}/${REPO}${path}`;
}

async function readJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'error',
        headers: {
            accept: 'application/vnd.github+json',
            'user-agent': 'argus-pr-updater',
            'x-github-api-version': '2022-11-28'
        }
    }).catch((error) => {
        throw new AppError(ErrorCode.DEPENDENCY, 'Impossibile contattare GitHub', {
            cause: error,
            details: { reason: error.name === 'AbortError' ? 'timeout' : 'network' }
        });
    }).finally(() => clearTimeout(timer));

    if (response.status === 403 || response.status === 429) {
        throw new AppError(ErrorCode.RATE_LIMITED, 'GitHub ha applicato un limite di frequenza. Riprova piu\' tardi.');
    }

    if (!response.ok) {
        throw new AppError(ErrorCode.DEPENDENCY, `GitHub ha risposto ${response.status}`);
    }

    const size = Number(response.headers.get('content-length') ?? 0);
    if (size > MAX_BODY_BYTES) {
        throw new AppError(ErrorCode.DEPENDENCY, 'Risposta di GitHub troppo grande');
    }

    return response.json();
}

function normalise(release) {
    if (!release || typeof release !== 'object') return null;
    if (release.draft === true) return null;
    if (!isReleaseTag(release.tag_name)) return null;

    return {
        tag: release.tag_name,
        name: typeof release.name === 'string' ? release.name.slice(0, 200) : release.tag_name,
        prerelease: release.prerelease === true,
        publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
        url: `https://github.com/${OWNER}/${REPO}/releases/tag/${encodeURIComponent(release.tag_name)}`,
        notes: typeof release.body === 'string' ? release.body.slice(0, 20000) : ''
    };
}

export async function fetchLatestRelease() {
    const payload = await readJson(endpoint('/releases/latest'));
    const release = normalise(payload);
    if (!release) throw new AppError(ErrorCode.DEPENDENCY, 'Nessuna release valida pubblicata');
    return release;
}

export const repository = Object.freeze({ owner: OWNER, name: REPO, url: `https://github.com/${OWNER}/${REPO}.git` });
