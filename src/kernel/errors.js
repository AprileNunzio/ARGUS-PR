export const ErrorCode = Object.freeze({
    VALIDATION: 'VALIDATION',
    UNAUTHENTICATED: 'UNAUTHENTICATED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',
    RATE_LIMITED: 'RATE_LIMITED',
    DEPENDENCY: 'DEPENDENCY',
    STORAGE: 'STORAGE',
    MEDIA: 'MEDIA',
    INTERNAL: 'INTERNAL'
});

const STATUS_BY_CODE = Object.freeze({
    VALIDATION: 400,
    UNAUTHENTICATED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    RATE_LIMITED: 429,
    DEPENDENCY: 502,
    STORAGE: 500,
    MEDIA: 500,
    INTERNAL: 500
});

export class AppError extends Error {
    constructor(code, message, options = {}) {
        super(message, { cause: options.cause });
        this.name = 'AppError';
        this.code = ErrorCode[code] ? code : ErrorCode.INTERNAL;
        this.status = STATUS_BY_CODE[this.code] ?? 500;
        this.details = options.details ?? null;
        this.exposable = options.exposable !== false;
    }

    toPublic() {
        return {
            code: this.code,
            message: this.exposable ? this.message : 'Internal error',
            details: this.exposable ? this.details : null
        };
    }
}

export function validationError(message, details = null) {
    return new AppError(ErrorCode.VALIDATION, message, { details });
}

export function notFound(resource) {
    return new AppError(ErrorCode.NOT_FOUND, `${resource} not found`);
}

export function forbidden(message = 'Insufficient permissions') {
    return new AppError(ErrorCode.FORBIDDEN, message);
}

export function unauthenticated(message = 'Authentication required') {
    return new AppError(ErrorCode.UNAUTHENTICATED, message);
}

export function internal(message, cause) {
    return new AppError(ErrorCode.INTERNAL, message, { cause, exposable: false });
}

export function fromUnknown(thrown, fallbackMessage = 'Unexpected failure') {
    if (thrown instanceof AppError) return thrown;
    const cause = thrown instanceof Error ? thrown : new Error(String(thrown));
    return internal(fallbackMessage, cause);
}
