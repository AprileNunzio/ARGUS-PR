import fs from 'node:fs';
import { log } from './logger.js';

const MAX_LINE_BYTES = 8192;
const MAX_BATCH_LINES = 500;

export function createEventWatcher(config, onEvent) {
    let offset = 0;
    let pending = '';
    let timer = null;
    let reading = false;

    function reset(size) {
        offset = size;
        pending = '';
    }

    function consume(chunk) {
        pending += chunk;

        if (pending.length > MAX_LINE_BYTES * MAX_BATCH_LINES) {
            log.warn('event backlog too large, discarding the buffer');
            pending = '';
            return;
        }

        const lines = pending.split('\n');
        pending = lines.pop() ?? '';

        for (const line of lines.slice(0, MAX_BATCH_LINES)) {
            const trimmed = line.trim();
            if (trimmed.length === 0 || trimmed.length > MAX_LINE_BYTES) continue;

            const parsed = (() => {
                try {
                    return JSON.parse(trimmed);
                } catch {
                    return null;
                }
            })();

            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) onEvent(parsed);
        }
    }

    function poll() {
        if (reading) return;
        reading = true;

        let stats = null;
        try {
            stats = fs.existsSync(config.eventsFile) ? fs.statSync(config.eventsFile) : null;
        } catch (error) {
            log.warn('cannot inspect the event stream', { message: error.message });
        }

        if (!stats) {
            reading = false;
            return;
        }

        if (stats.size < offset) {
            log.info('event stream rotated');
            reset(0);
        }

        if (stats.size === offset) {
            reading = false;
            return;
        }

        const stream = fs.createReadStream(config.eventsFile, {
            start: offset,
            end: stats.size - 1,
            encoding: 'utf8'
        });

        stream.on('data', (chunk) => consume(chunk));
        stream.on('error', (error) => {
            log.warn('cannot read the event stream', { message: error.message });
            reading = false;
        });
        stream.on('close', () => {
            offset = stats.size;
            reading = false;
        });
    }

    return {
        start(fromBeginning = false) {
            if (!fromBeginning && fs.existsSync(config.eventsFile)) {
                try {
                    offset = fs.statSync(config.eventsFile).size;
                } catch {
                    offset = 0;
                }
            }

            timer = setInterval(poll, config.pollIntervalMs);
            timer.unref();
            poll();
        },

        stop() {
            if (timer) clearInterval(timer);
            timer = null;
        },

        position() {
            return offset;
        }
    };
}
