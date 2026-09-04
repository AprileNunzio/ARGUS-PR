import { createLogger, describeError } from './logger.js';

const log = createLogger('process');

const shutdownTasks = [];
let shuttingDown = false;

const TRANSPORT_ERRORS = new Set(['EPIPE', 'ECONNRESET', 'ECONNABORTED', 'ERR_STREAM_DESTROYED', 'ERR_STREAM_WRITE_AFTER_END']);

function isTransportTeardown(error) {
    return TRANSPORT_ERRORS.has(error?.code);
}

export function onShutdown(name, task) {
    shutdownTasks.push({ name, task });
}

async function runShutdown(reason, exitCode) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('shutdown started', { reason });

    for (const { name, task } of shutdownTasks.reverse()) {
        const outcome = await Promise.resolve()
            .then(() => task())
            .then(() => null)
            .catch((error) => error);
        if (outcome) {
            log.error('shutdown task failed', { task: name, error: describeError(outcome) });
            continue;
        }
        log.debug('shutdown task done', { task: name });
    }

    log.info('shutdown complete', { reason, exitCode });
    process.exit(exitCode);
}

export function installProcessGuard() {
    process.on('uncaughtException', (error) => {
        if (isTransportTeardown(error)) {
            log.warn('client disconnected mid transfer', { code: error.code, message: error.message });
            return;
        }
        log.error('uncaught exception', { error: describeError(error) });
        runShutdown('uncaughtException', 1);
    });

    process.on('unhandledRejection', (reason) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        log.error('unhandled rejection', { error: describeError(error) });
        runShutdown('unhandledRejection', 1);
    });

    process.on('SIGINT', () => runShutdown('SIGINT', 0));
    process.on('SIGTERM', () => runShutdown('SIGTERM', 0));
}

export function requestShutdown(reason = 'requested') {
    return runShutdown(reason, 0);
}
