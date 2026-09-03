import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { projectRoot } from './paths.js';
import { ok, fail } from '../kernel/result.js';
import { AppError, ErrorCode } from '../kernel/errors.js';

const run = promisify(execFile);

const BINARY_SUFFIX = process.platform === 'win32' ? '.exe' : '';

function vendorCandidate(name) {
    return path.join(projectRoot, 'vendor', 'ffmpeg', `${name}${BINARY_SUFFIX}`);
}

function candidatesFor(name, override) {
    const list = [];
    if (override) list.push(override);
    list.push(vendorCandidate(name));
    list.push(`${name}${BINARY_SUFFIX}`);
    if (process.platform !== 'win32') {
        list.push(`/usr/bin/${name}`, `/usr/local/bin/${name}`, `/snap/bin/${name}`);
    }
    return list;
}

async function probeBinary(candidate) {
    const result = await run(candidate, ['-version'], { timeout: 8000, windowsHide: true })
        .then((out) => ({ ok: true, stdout: out.stdout }))
        .catch(() => ({ ok: false, stdout: '' }));

    if (!result.ok) return null;

    const firstLine = result.stdout.split('\n')[0] ?? '';
    const version = firstLine.match(/version\s+(\S+)/)?.[1] ?? 'unknown';
    return { path: candidate, version };
}

async function locate(name, override) {
    for (const candidate of candidatesFor(name, override)) {
        if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
        const found = await probeBinary(candidate);
        if (found) return found;
    }
    return null;
}

export async function discoverFfmpeg(overrides = {}) {
    const ffmpeg = await locate('ffmpeg', overrides.ffmpegPath);
    if (!ffmpeg) {
        return fail(new AppError(
            ErrorCode.DEPENDENCY,
            'ffmpeg not found. Install it or set ARGUS_FFMPEG_PATH.',
            { details: { searched: candidatesFor('ffmpeg', overrides.ffmpegPath) } }
        ));
    }

    const ffprobe = await locate('ffprobe', overrides.ffprobePath);
    if (!ffprobe) {
        return fail(new AppError(
            ErrorCode.DEPENDENCY,
            'ffprobe not found. It ships with ffmpeg; ensure both are installed.'
        ));
    }

    return ok({ ffmpeg, ffprobe });
}

export async function detectRtspTimeoutOption(ffmpegPath) {
    const help = await run(ffmpegPath, ['-hide_banner', '-h', 'demuxer=rtsp'], { timeout: 8000, windowsHide: true })
        .then((out) => `${out.stdout}${out.stderr ?? ''}`)
        .catch(() => '');

    if (/^\s+-stimeout\s/m.test(help)) return 'stimeout';
    if (/^\s+-timeout\s/m.test(help)) return 'timeout';
    return null;
}

export async function listHardwareAccelerators(ffmpegPath) {
    const result = await run(ffmpegPath, ['-hide_banner', '-hwaccels'], { timeout: 8000, windowsHide: true })
        .then((out) => out.stdout)
        .catch(() => '');

    return result
        .split('\n')
        .slice(1)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.includes(':'));
}
