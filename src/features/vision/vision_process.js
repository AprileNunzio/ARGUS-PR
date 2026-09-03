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
            if (performanceSettings.hwaccelBackend && performanceSettings.hwaccelBackend !== 'none') {
                const backend = performanceSettings.hwaccelBackend === 'auto' ? 'auto' : performanceSettings.hwaccelBackend;
                ffmpegArgs.splice(ffmpegArgs.indexOf('-i'), 0, '-hwaccel', backend);
            }

            ffmpegArgs.push(
                '-an',
                '-vf', 'fps=5,scale=640:360',
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
            log.warn('cannot spawn vision process', { error: err.message, cameraId: camera.id });
            if (onError) onError(err);
            scheduleRestart();
            return;
        }

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
            log.debug('worker vision stderr', { msg: d.toString().trim() });
        });

        const rl = createInterface({ input: workerChild.stdout });
        rl.on('line', (line) => {
            if (!line.trim()) return;
            try {
                const parsed = JSON.parse(line);
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
        stop() {
            isTerminated = true;
            if (restartTimer) {
                clearTimeout(restartTimer);
                restartTimer = null;
            }
            stopPipes();
        }
    };
}
