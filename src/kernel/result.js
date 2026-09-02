export function ok(value = null) {
    return { ok: true, value };
}

export function fail(error) {
    return { ok: false, error };
}

export function isOk(result) {
    return result !== null && typeof result === 'object' && result.ok === true;
}

export function isFail(result) {
    return result !== null && typeof result === 'object' && result.ok === false;
}

export function unwrap(result) {
    if (isOk(result)) return result.value;
    throw result.error;
}

export function mapOk(result, transform) {
    return isOk(result) ? ok(transform(result.value)) : result;
}

export async function collect(results) {
    const values = [];
    for (const result of results) {
        const settled = await result;
        if (isFail(settled)) return settled;
        values.push(settled.value);
    }
    return ok(values);
}
