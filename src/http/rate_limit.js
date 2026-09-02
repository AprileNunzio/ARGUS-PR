const buckets = new Map();

function prune(now) {
    for (const [key, entry] of buckets) {
        if (entry.resetAt <= now) buckets.delete(key);
    }
}

export function consume(key, limit, windowMs) {
    const now = Date.now();
    if (buckets.size > 5000) prune(now);

    const entry = buckets.get(key);

    if (!entry || entry.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
    }

    if (entry.count >= limit) {
        return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
    }

    entry.count += 1;
    return { allowed: true, remaining: limit - entry.count, retryAfterMs: 0 };
}

export function reset(key) {
    buckets.delete(key);
}
