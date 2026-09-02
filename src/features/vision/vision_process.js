import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { createLogger } from '../../kernel/logger.js';

const log = createLogger('vision-process');

export function createVisionProcess({ camera, ffmpegPath, pythonBin = 'python', modelsDir, performanceSettings = {}, onDetections, onError }) {
    let ffmpegChild = null;
    let workerChild = null;
    let isTerminated = false;
    let restartTimer = null;

    const streamUrl = camera.subStreamUrl ?? camera.mainStreamUrl;
    const workerScript = join(process.cwd(), 'vision', 'worker.py');

    function start() {
        if (isTerminated) return;

        const ffmpegArgs = [
            '-hide_banner',
            '-loglevel', 'error',
            '-nostdin'
        ];
        if (performanceSettings.hwaccelBackend && performanceSettings.hwaccelBackend !== 'none') {
            ffmpegArgs.push('-hwaccel', performanceSettings.hwaccelBackend === 'auto' ? 'auto' : performanceSettings.hwaccelBackend);
        }
        ffmpegArgs.push(
            '-rtsp_transport', camera.transport === 'udp' ? 'udp' : 'tcp',
            '-i', streamUrl,
            '-an',
            '-vf', 'fps=5,scale=640:360',
            '-f', 'rawvideo',
            '-pix_fmt', 'bgr24',
            'pipe:1'
        );

        const workerArgs = [workerScript, '--models-dir', modelsDir];
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
            ffmpegChild = spawn(ffmpegPath, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
            workerChild = spawn(pythonBin, workerArgs, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
        } catch (err) {
            log.warn('cannot spawn vision process', { error: err.message, cameraId: camera.id });
            if (onError) onError(err);
            scheduleRestart();
            return;
        }

        ffmpegChild.stdout.pipe(workerChild.stdin);


        ffmpegChild.stderr.on('data', (d) => {
            log.debug('ffmpeg vision stderr', { msg: d.toString().trim() });
        });

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

        ffmpegChild.on('exit', handleExit);
        workerChild.on('exit', handleExit);
    }

    function stopPipes() {
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
