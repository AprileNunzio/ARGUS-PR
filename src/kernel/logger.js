const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40, silent: 99 });

let threshold = LEVELS.info;
let sink = process.stdout;

function serialise(level, scope, message, fields) {
    const record = {
        ts: new Date().toISOString(),
        level,
        scope,
        msg: message
    };
    if (fields && typeof fields === 'object') {
        for (const [key, value] of Object.entries(fields)) {
            if (value instanceof Error) {
                record[key] = { name: value.name, message: value.message, code: value.code ?? null };
                continue;
            }
            record[key] = value;
        }
    }
    return `${JSON.stringify(record)}\n`;
}

function emit(level, scope, message, fields) {
    if (LEVELS[level] < threshold) return;
    sink.write(serialise(level, scope, message, fields));
}

export function setLogLevel(level) {
    threshold = LEVELS[level] ?? LEVELS.info;
}

export function setLogSink(stream) {
    sink = stream;
}

export function createLogger(scope) {
    return {
        debug: (message, fields) => emit('debug', scope, message, fields),
        info: (message, fields) => emit('info', scope, message, fields),
        warn: (message, fields) => emit('warn', scope, message, fields),
        error: (message, fields) => emit('error', scope, message, fields),
        child: (suffix) => createLogger(`${scope}:${suffix}`)
    };
}

export function describeError(error) {
    if (!error) return { message: 'unknown' };
    const chain = [];
    let current = error;
    let depth = 0;
    while (current && depth < 5) {
        chain.push({
            name: current.name ?? 'Error',
            code: current.code ?? null,
            message: current.message ?? String(current)
        });
        current = current.cause;
        depth += 1;
    }
    return { chain, stack: error.stack ?? null };
}
