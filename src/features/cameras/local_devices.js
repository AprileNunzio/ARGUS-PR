import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { getMediaTools, mediaToolsStatus } from '../../platform/media_tools.js';
import { createLogger } from '../../kernel/logger.js';
import { requireDeviceId } from './camera_input.js';

const log = createLogger('devices');
const LIST_TIMEOUT_MS = 8000;

const DSHOW_DEVICE = /"([^"]+)"\s*\((video|audio)\)/;
const DSHOW_OPTION = /(vcodec|pixel_format)=(\S+)\s+min s=(\d+)x(\d+) fps=([\d.]+) max s=(\d+)x(\d+) fps=([\d.]+)/;
const V4L2_FORMAT = /^\s*(?:\[[^\]]+\]\s*)?(?:Compressed|Raw)\s*:\s*(\S+)\s*:/;
const V4L2_SIZES = /(\d{2,4}x\d{2,4})/g;

function runTool(binary, args) {
    return new Promise((resolve) => {
        execFile(binary, args, {
            timeout: LIST_TIMEOUT_MS,
            windowsHide: true,
            maxBuffer: 1024 * 512,
            shell: false
        }, (error, stdout, stderr) => resolve({ stdout: stdout ?? '', stderr: stderr ?? '', failed: Boolean(error) }));
    });
}

function parseDshowDevices(output) {
    const devices = [];
    for (const line of output.split(/\r?\n/)) {
        const match = DSHOW_DEVICE.exec(line);
        if (!match) continue;
        if (match[2] !== 'video') continue;
        devices.push({ id: match[1], label: match[1], driver: 'dshow' });
    }
    return devices;
}

function parseDshowOptions(output) {
    const formats = new Map();
    for (const line of output.split(/\r?\n/)) {
        const match = DSHOW_OPTION.exec(line);
        if (!match) continue;
        const format = match[2];
        const size = `${match[6]}x${match[7]}`;
        const fps = Math.round(Number.parseFloat(match[8]));
        const key = `${format}|${size}`;
        const current = formats.get(key);
        if (!current || fps > current.fps) formats.set(key, { format, size, fps });
    }
    return [...formats.values()];
}

function parseV4l2Formats(output) {
    const formats = [];
    for (const line of output.split(/\r?\n/)) {
        const match = V4L2_FORMAT.exec(line);
        if (!match) continue;
        const sizes = line.match(V4L2_SIZES) ?? [];
        for (const size of sizes) formats.push({ format: match[1], size, fps: null });
    }
    return formats;
}

async function listWindowsDevices(ffmpegPath, withFormats) {
    const listing = await runTool(ffmpegPath, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']);
    const devices = parseDshowDevices(listing.stderr);
    if (!withFormats) return devices;

    for (const device of devices) {
        const options = await runTool(ffmpegPath, ['-hide_banner', '-list_options', 'true', '-f', 'dshow', '-i', `video=${device.id}`]);
        device.formats = parseDshowOptions(options.stderr);
    }
    return devices;
}

async function listLinuxDevices(ffmpegPath, withFormats) {
    const entries = await readdir('/dev').catch(() => []);
    const nodes = entries.filter((name) => /^video\d+$/.test(name)).sort();
    const devices = [];

    for (const node of nodes) {
        const name = await readFile(`/sys/class/video4linux/${node}/name`, 'utf8').catch(() => null);
        const device = {
            id: `/dev/${node}`,
            label: name ? name.trim() : `/dev/${node}`,
            driver: 'v4l2'
        };
        if (withFormats) {
            const listing = await runTool(ffmpegPath, ['-hide_banner', '-f', 'v4l2', '-list_formats', 'all', '-i', device.id]);
            device.formats = parseV4l2Formats(listing.stderr);
        }
        devices.push(device);
    }
    return devices;
}

async function listDarwinDevices(ffmpegPath) {
    const listing = await runTool(ffmpegPath, ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', '']);
    const devices = [];
    let inVideoSection = false;

    for (const line of listing.stderr.split(/\r?\n/)) {
        if (line.includes('AVFoundation video devices')) { inVideoSection = true; continue; }
        if (line.includes('AVFoundation audio devices')) { inVideoSection = false; continue; }
        if (!inVideoSection) continue;
        const match = /\[(\d+)\]\s+(.+?)\s*$/.exec(line.replace(/^\[[^\]]+\]\s*/, ''));
        if (!match) continue;
        devices.push({ id: match[1], label: match[2], driver: 'avfoundation' });
    }
    return devices;
}

export async function listLocalDevices(options = {}) {
    const status = mediaToolsStatus();
    if (!status.available) return { available: false, reason: status.reason ?? 'ffmpeg missing', platform: process.platform, devices: [] };

    const tools = getMediaTools();

    const withFormats = options.withFormats === true;
    const platform = options.platform ?? process.platform;

    const devices = platform === 'win32'
        ? await listWindowsDevices(tools.ffmpeg.path, withFormats)
        : platform === 'darwin'
            ? await listDarwinDevices(tools.ffmpeg.path)
            : await listLinuxDevices(tools.ffmpeg.path, withFormats);

    const safe = devices.filter((device) => {
        const valid = (() => {
            try {
                requireDeviceId(device.id, 'Capture device');
                return true;
            } catch {
                return false;
            }
        })();
        if (!valid) log.warn('capture device rejected by validation', { label: device.label });
        return valid;
    });

    return { available: true, platform, devices: safe };
}

export const parsers = Object.freeze({ parseDshowDevices, parseDshowOptions, parseV4l2Formats });
