export const RetentionReason = Object.freeze({
    AGE: 'age',
    CAMERA_QUOTA: 'camera-quota',
    DISK_PRESSURE: 'disk-pressure'
});

function byOldestFirst(a, b) {
    return a.startedAt - b.startedAt;
}

export function planRetention(inventory, policy, now = Date.now()) {
    const removals = [];
    const kept = [];

    const candidates = inventory.slice().sort(byOldestFirst);
    let totalBytes = candidates.reduce((sum, item) => sum + item.bytes, 0);

    const maxAgeMs = policy.maxAgeDays > 0 ? policy.maxAgeDays * 86400000 : 0;
    const quotaBytes = policy.maxBytes > 0 ? policy.maxBytes : 0;

    for (const segment of candidates) {
        if (segment.protected) {
            kept.push(segment);
            continue;
        }

        if (maxAgeMs > 0 && now - segment.startedAt > maxAgeMs) {
            removals.push({ ...segment, reason: RetentionReason.AGE });
            totalBytes -= segment.bytes;
            continue;
        }

        kept.push(segment);
    }

    if (quotaBytes > 0 && totalBytes > quotaBytes) {
        for (const segment of kept.slice().sort(byOldestFirst)) {
            if (totalBytes <= quotaBytes) break;
            if (segment.protected) continue;

            removals.push({ ...segment, reason: RetentionReason.CAMERA_QUOTA });
            totalBytes -= segment.bytes;
            kept.splice(kept.indexOf(segment), 1);
        }
    }

    const freeShortfall = policy.minFreeBytes > 0 && policy.currentFreeBytes >= 0
        ? policy.minFreeBytes - (policy.currentFreeBytes + removals.reduce((sum, item) => sum + item.bytes, 0))
        : 0;

    if (freeShortfall > 0) {
        let reclaimed = 0;
        for (const segment of kept.slice().sort(byOldestFirst)) {
            if (reclaimed >= freeShortfall) break;
            if (segment.protected) continue;

            removals.push({ ...segment, reason: RetentionReason.DISK_PRESSURE });
            reclaimed += segment.bytes;
            kept.splice(kept.indexOf(segment), 1);
        }
    }

    return {
        remove: removals,
        keep: kept,
        remainingBytes: kept.reduce((sum, item) => sum + item.bytes, 0)
    };
}

export function summarise(plan) {
    const byReason = {};
    for (const item of plan.remove) {
        byReason[item.reason] = (byReason[item.reason] ?? 0) + 1;
    }
    return {
        removeCount: plan.remove.length,
        freedBytes: plan.remove.reduce((sum, item) => sum + item.bytes, 0),
        keepCount: plan.keep.length,
        remainingBytes: plan.remainingBytes,
        byReason
    };
}
