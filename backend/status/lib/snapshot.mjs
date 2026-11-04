function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function comparableMetric(metric) {
    if (!isPlainObject(metric)) return null;
    const { updatedAt, ...rest } = metric;
    return rest;
}

function sameMetric(left, right) {
    return JSON.stringify(comparableMetric(left)) === JSON.stringify(comparableMetric(right));
}

/**
 * Keep the last good value when a metric fails, while surfacing a generic error
 * code. A metric that has never succeeded is stored as ok:false with no value.
 */
export function mergeMetric(previous, next, nowIso) {
    if (next && next.ok === true) {
        const { ok, ...values } = next;
        return { ...values, ok: true, updatedAt: nowIso };
    }
    const error = next && typeof next.error === "string" ? next.error : "unknown";
    if (isPlainObject(previous)) {
        return { ...previous, ok: false, error };
    }
    return { ok: false, error, updatedAt: null };
}

/**
 * Build the status document. The file is only considered changed when a value,
 * its availability, or its error state changed; refreshed collection times alone
 * do not create a diff, which keeps the repository free of empty commits.
 */
export function buildSnapshot(previous, results, nowMs = Date.now()) {
    const nowIso = new Date(nowMs).toISOString();
    const previousDeepSeek = isPlainObject(previous) ? previous.deepseek : null;
    const previousCodex = isPlainObject(previous) ? previous.codex : null;

    const nextDeepSeek = mergeMetric(previousDeepSeek, results.deepseek, nowIso);
    const nextCodex = mergeMetric(previousCodex, results.codex, nowIso);

    const deepSeekChanged = !sameMetric(previousDeepSeek, nextDeepSeek);
    const codexChanged = !sameMetric(previousCodex, nextCodex);

    if (!deepSeekChanged && !codexChanged) {
        return { changed: false, snapshot: previous };
    }

    return {
        changed: true,
        snapshot: {
            schemaVersion: 1,
            generatedAt: nowIso,
            deepseek: deepSeekChanged ? nextDeepSeek : previousDeepSeek,
            codex: codexChanged ? nextCodex : previousCodex,
        },
    };
}
