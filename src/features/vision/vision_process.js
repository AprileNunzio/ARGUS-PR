import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createLogger } from '../../kernel/logger.js';
import { getMediaTools, mediaToolsStatus } from '../../platform/media_tools.js';
import { getCameraSecrets } from '../cameras/camera_repository.js';
import { resolveInput, buildCaptureArgs, isLocalKind } from '../cameras/camera_input.js';
import { attachLocalConsumer } from '../cameras/local_capture.js';

const log = createLogger('vision-process');

export function resolvePythonBin(dataDir) {
    if (dataDir) {
        const winBin = join(dataDir, 'vision', 'venv', 'Scripts', 'python.exe');
        if (existsSync(winBin)) return winBin;
        const nixBin = join(dataDir, 'vision', 'venv', 'bin', 'python');
        if (existsSync(nixBin)) return nixBin;
    }
    return process.platform === 'win32' ? 'python' : 'python3';
}

export function createVisionProcess({ camera, ffmpegPath, pythonBin, dataDir, modelsDir, performanceSettings = {}, workerProfile = null, onDetections, onError }) {
    const resolvedPython = pythonBin ?? resolvePythonBin(dataDir);
    let ffmpegChild = null;
    let workerChild = null;
    let localHandle = null;
    let isTerminated = false;
    let restartTimer = null;

    const stats = {
        state: 'starting',
        startedAt: null,
        restarts: 0,
        frames: 0,
        detections: 0,
        lastFrameAt: null,
        lastDetectionAt: null,
        lastError: null,
        inferenceMs: null,
        provider: null,
        droppedFrames: 0,
        analysisFps: 0
    };

    const framesWindow = [];

    const workerScript = join(process.cwd(), 'vision', 'worker.py');

    function start() {
        if (isTerminated) return;

        const secrets = getCameraSecrets(camera.id);
        if (!secrets) {
            log.warn('vision skipped: camera missing', { cameraId: camera.id });
            return;
        }

        const status = mediaToolsStatus();
        if (!status.available) {
            log.warn('vision deferred: ffmpeg unavailable', { cameraId: camera.id });
            scheduleRestart();
            return;
        }

        const binary = ffmpegPath && ffmpegPath.length > 0 ? ffmpegPath : getMediaTools().ffmpeg.path;
        const local = isLocalKind(secrets.sourceKind);
        const input = local ? null : resolveInput(secrets, { preferSub: true });
        const ffmpegArgs = local ? null : buildCaptureArgs(input);

        if (!local) {
            const usable = status.accelerators ?? [];
            const requested = performanceSettings.hwaccelBackend ?? 'auto';
            const backend = requested === 'none'
                ? null
                : (requested === 'auto' ? usable[0] ?? null : (usable.includes(requested) ? requested : null));

            if (backend) ffmpegArgs.splice(ffmpegArgs.indexOf('-i'), 0, '-hwaccel', backend);

            const analysisFps = Number(performanceSettings.analysisFps) > 0
                ? Math.max(1, Math.min(15, Math.round(performanceSettings.analysisFps)))
                : 2;

            stats.analysisFps = analysisFps;

            ffmpegArgs.push(
                '-an',
                '-vf', `fps=${analysisFps},scale=640:360`,
                '-f', 'rawvideo',
                '-pix_fmt', 'bgr24',
                'pipe:1'
            );
        }

        const workerArgs = [workerScript, '--models-dir', modelsDir];
        if (workerProfile) {
            workerArgs.push('--profile', JSON.stringify(workerProfile));
        }
        if (performanceSettings.aiExecutionProvider) {
            workerArgs.push('--provider', performanceSettings.aiExecutionProvider);
        }
        if (performanceSettings.aiIntraThreads) {
            workerArgs.push('--intra-threads', String(performanceSettings.aiIntraThreads));
        }
        if (performanceSettings.aiInterThreads) {
            workerArgs.push('--inter-threads', String(performanceSettings.aiInterThreads));
        }

        try {
            if (local) localHandle = attachLocalConsumer(secrets, 'vision');
            else ffmpegChild = spawn(binary, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

            workerChild = spawn(resolvedPython, workerArgs, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
        } catch (err) {
            stats.state = 'failed';
            stats.lastError = err.message.slice(0, 200);
            log.warn('cannot spawn vision process', { error: err.message, cameraId: camera.id });
            if (onError) onError(err);
            scheduleRestart();
            return;
        }

        stats.state = 'running';
        stats.startedAt = Date.now();
        stats.lastError = null;

        if (local) {
            localHandle.stream.on('data', (chunk) => {
                if (workerChild?.stdin.writable) workerChild.stdin.write(chunk);
            });
        } else {
            ffmpegChild.stdout.pipe(workerChild.stdin);
            ffmpegChild.stderr.on('data', (d) => {
                log.debug('ffmpeg vision stderr', { msg: d.toString().trim() });
            });
        }

        workerChild.stderr.on('data', (d) => {
            const message = d.toString().trim();
            if (message.length > 0) stats.lastError = message.slice(-200);
            log.debug('worker vision stderr', { msg: message });
        });

        const rl = createInterface({ input: workerChild.stdout });
        rl.on('line', (line) => {
            if (!line.trim()) return;
            try {
                const parsed = JSON.parse(line);
                const now = Date.now();

                stats.frames += 1;
                stats.lastFrameAt = now;
                if (Number.isFinite(parsed.ms)) stats.inferenceMs = Math.round(parsed.ms);
                if (typeof parsed.provider === 'string') stats.provider = parsed.provider;
                if (Number.isFinite(parsed.dropped)) stats.droppedFrames = parsed.dropped;

                framesWindow.push(now);
                while (framesWindow.length > 0 && now - framesWindow[0] > 10000) framesWindow.shift();

                const found = parsed.dets?.length ?? 0;
                if (found > 0) {
                    stats.detections += found;
                    stats.lastDetectionAt = now;
                }

                if (onDetections) {
                    onDetections({
                        cameraId: camera.id,
                        timestamp: parsed.t,
                        seq: parsed.seq,
                        detections: parsed.dets ?? []
                    });
                }
            } catch (err) {
                log.debug('malformed vision line', { error: err.message });
            }
        });

        const handleExit = () => {
            stats.state = 'restarting';
            stats.restarts += 1;
            stopPipes();
            scheduleRestart();
        };

        ffmpegChild?.on('exit', handleExit);
        workerChild.on('exit', handleExit);
    }

    function stopPipes() {
        if (localHandle) {
            localHandle.stop();
            localHandle = null;
        }
        if (ffmpegChild) {
            ffmpegChild.removeAllListeners('exit');
            try { ffmpegChild.kill('SIGKILL'); } catch {}
            ffmpegChild = null;
        }
        if (workerChild) {
            workerChild.removeAllListeners('exit');
            try { workerChild.kill('SIGKILL'); } catch {}
            workerChild = null;
        }
    }

    function scheduleRestart() {
        if (isTerminated) return;
        if (restartTimer) clearTimeout(restartTimer);
        restartTimer = setTimeout(() => {
            restartTimer = null;
            start();
        }, 10000);
    }

    start();

    return {
        snapshot() {
            const now = Date.now();
            const recent = framesWindow.filter((entry) => now - entry <= 10000);

            return {
                ...stats,
                framesPerSecond: Math.round((recent.length / 10) * 10) / 10,
                saturated: stats.inferenceMs !== null && stats.analysisFps > 0 && stats.inferenceMs > 1000 / stats.analysisFps,
                uptimeSeconds: stats.startedAt ? Math.round((now - stats.startedAt) / 1000) : 0,
                stale: stats.lastFrameAt !== null && now - stats.lastFrameAt > 15000
            };
        },
        stop() {
            isTerminated = true;
            stats.state = 'stopped';
            if (restartTimer) {
                clearTimeout(restartTimer);
                restartTimer = null;
            }
            stopPipes();
        }
    };
}
