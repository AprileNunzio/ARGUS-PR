import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { PassThrough } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { getMediaTools } from '../../platform/media_tools.js';
import { pickEncoder, encoderArgs } from '../streaming/encoder.js';
import { resolveInput, buildCaptureArgs } from './camera_input.js';
import { createLogger } from '../../kernel/logger.js';

const log = createLogger('local-capture');

const RESTART_DELAY_MS = 4000;
const REBUILD_DELAY_MS = 150;

const brokers = new Map();
let runtimeConfig = null;

export function initLocalCapture(config) {
    runtimeConfig = config;
}

function channelAddress(cameraId, role, generation) {
    const token = `${cameraId.slice(0, 8)}-${role}-${generation}`;
    if (process.platform === 'win32') return { path: `\\\\.\\pipe\\argus-${token}`, cleanup: null };

    const dir = join(runtimeConfig?.dataDir ?? process.cwd(), 'run');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${token}.sock`);
    rmSync(path, { force: true });
    return { path, cleanup: path };
}

function channelTarget(address) {
    return process.platform === 'win32' ? address.path : `unix://${address.path}`;
}

function createBroker(cameraId) {
    const consumers = new Map();
    let child = null;
    let servers = [];
    let cleanups = [];
    let restartTimer = null;
    let rebuildTimer = null;
    let generation = 0;
    let secrets = null;

    function closeServers() {
        for (const server of servers) server.close();
        for (const path of cleanups) rmSync(path, { force: true });
        servers = [];
        cleanups = [];
    }

    function killChild() {
        if (!child) return;
        child.removeAllListeners('exit');
        try { child.kill('SIGKILL'); } catch { /* il processo era gia uscito */ }
        child = null;
    }

    function openChannel(role, consumer) {
        const address = channelAddress(cameraId, role, generation);
        const server = createServer((socket) => {
            socket.on('data', (chunk) => consumer.stream.write(chunk));
            socket.on('error', () => undefined);
        });
        server.on('error', (error) => log.warn('channel error', { cameraId, role, error: error.message }));
        server.listen(address.path);
        servers.push(server);
        if (address.cleanup) cleanups.push(address.cleanup);
        return channelTarget(address);
    }

    function outputArgs(accelerators) {
        const args = [];
        const encoder = pickEncoder(accelerators, secrets?.hwaccel === 'none' ? 'libx264' : 'auto');

        for (const consumer of consumers.values()) {
            if (consumer.role === 'record') {
                const options = consumer.options;
                args.push('-map', '0:v:0');
                args.push(...encoderArgs(encoder, { gop: 50, preset: 'veryfast', tune: 'zerolatency' }));
                args.push('-f', 'segment');
                args.push('-segment_time', String(options.segmentSeconds));
                args.push('-segment_format', 'mp4');
                args.push('-segment_format_options', 'movflags=+faststart');
                args.push('-segment_list', options.listingPath);
                args.push('-segment_list_type', 'csv');
                args.push('-segment_list_flags', '+live');
                args.push('-segment_list_size', '0');
                args.push('-reset_timestamps', '1');
                args.push('-strftime', '1');
                args.push('-segment_atclocktime', '1');
                args.push(options.pattern);
                continue;
            }

            if (consumer.role === 'live') {
                args.push('-map', '0:v:0', '-an');
                args.push(...encoderArgs(encoder, { gop: 50, bitrate: '2500k', maxrate: '3000k', bufsize: '4000k' }));
                args.push('-f', 'mp4');
                args.push('-movflags', 'frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset');
                args.push('-frag_duration', '500000');
                args.push('pipe:1');
                continue;
            }

            if (consumer.role === 'motion') {
                args.push('-map', '0:v:0', '-an', '-vf', 'fps=5,scale=160:90,format=gray');
                args.push('-f', 'rawvideo', '-pix_fmt', 'gray', openChannel('motion', consumer));
                continue;
            }

            args.push('-map', '0:v:0', '-an', '-vf', 'fps=5,scale=640:360');
            args.push('-f', 'rawvideo', '-pix_fmt', 'bgr24', openChannel('vision', consumer));
        }

        return args;
    }

    function start() {
        if (consumers.size === 0 || child) return;

        const tools = getMediaTools();
        generation += 1;

        const input = resolveInput(secrets, { preferSub: false });
        const args = buildCaptureArgs(input);
        args.splice(args.indexOf('-i'), 0, '-y');
        args.push(...outputArgs(tools.accelerators));

        const live = [...consumers.values()].find((consumer) => consumer.role === 'live');
        child = spawn(tools.ffmpeg.path, args, {
            windowsHide: true,
            shell: false,
            stdio: ['ignore', live ? 'pipe' : 'ignore', 'pipe']
        });

        if (live) child.stdout.on('data', (chunk) => live.stream.write(chunk));

        child.stderr.on('data', (chunk) => {
            const text = chunk.toString('utf8').trim();
            if (text.length > 0) log.warn('ffmpeg', { cameraId, message: text.slice(0, 300) });
        });

        child.on('exit', (code) => {
            log.warn('capture stopped', { cameraId, code });
            child = null;
            closeServers();
            scheduleRestart();
        });

        log.info('capture started', { cameraId, roles: [...consumers.values()].map((entry) => entry.role) });
    }

    function scheduleRestart() {
        if (consumers.size === 0 || restartTimer) return;
        restartTimer = setTimeout(() => {
            restartTimer = null;
            start();
        }, RESTART_DELAY_MS);
        restartTimer.unref();
    }

    function rebuild() {
        if (rebuildTimer) clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(() => {
            rebuildTimer = null;
            killChild();
            closeServers();
            if (consumers.size > 0) start();
        }, REBUILD_DELAY_MS);
        rebuildTimer.unref();
    }

    return {
        attach(camera, role, options) {
            secrets = camera;
            const token = randomBytes(8).toString('hex');
            const consumer = { role, options: options ?? {}, stream: role === 'record' ? null : new PassThrough() };
            consumers.set(token, consumer);
            rebuild();

            return {
                stream: consumer.stream,
                stop() {
                    if (!consumers.delete(token)) return;
                    consumer.stream?.end();
                    if (consumers.size === 0) {
                        if (restartTimer) clearTimeout(restartTimer);
                        restartTimer = null;
                        killChild();
                        closeServers();
                        brokers.delete(cameraId);
                        return;
                    }
                    rebuild();
                }
            };
        },
        roles() {
            return [...consumers.values()].map((entry) => entry.role);
        }
    };
}

export function attachLocalConsumer(camera, role, options) {
    if (!brokers.has(camera.id)) brokers.set(camera.id, createBroker(camera.id));
    return brokers.get(camera.id).attach(camera, role, options);
}

export function localCaptureState() {
    return [...brokers.entries()].map(([cameraId, broker]) => ({ cameraId, roles: broker.roles() }));
}
