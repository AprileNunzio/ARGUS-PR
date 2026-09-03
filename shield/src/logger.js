const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

let threshold = LEVELS[process.env.ARGUS_SHIELD_LOG_LEVEL ?? 'info'] ?? LEVELS.info;

export function setLevel(level) {
    threshold = LEVELS[level] ?? threshold;
}

function write(level, message, fields) {
    if (LEVELS[level] < threshold) return;

    const payload = {
        at: new Date().toISOString(),
        level,
        scope: 'shield',
        message,
        ...(fields ?? {})
    };

    const stream = LEVELS[level] >= LEVELS.warn ? process.stderr : process.stdout;
    stream.write(JSON.stringify(payload) + '\n');
}

export const log = Object.freeze({
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields)
});

export function print(text) {
    process.stdout.write(text + '\n');
}
