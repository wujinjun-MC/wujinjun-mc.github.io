const DEFAULT_MIN_LEVEL_DELTA = 2;
const MAX_REPORT_TIME_DRIFT_MS = 10 * 60 * 1000;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function parseLevel(raw) {
    const text = String(raw === undefined || raw === null ? "" : raw).trim();
    if (!/^\d{1,3}$/.test(text)) return null;
    const level = Number(text);
    return level >= 0 && level <= 100 ? level : null;
}

export function parseCharging(raw) {
    const text = String(raw === undefined || raw === null ? "" : raw).trim().toLowerCase();
    if (!text) return false;
    return ["true", "1", "yes", "charging", "plugged", "full"].includes(text);
}

export function parseReportedAt(raw, nowMs = Date.now()) {
    const text = String(raw === undefined || raw === null ? "" : raw).trim();
    if (!text) return nowMs;
    let parsed = NaN;
    if (/^\d+$/.test(text)) {
        const numeric = Number(text);
        parsed = text.length <= 10 ? numeric * 1000 : numeric;
    } else {
        parsed = Date.parse(text);
    }
    if (!Number.isFinite(parsed)) return nowMs;
    const drift = Math.abs(nowMs - parsed);
    return drift <= MAX_REPORT_TIME_DRIFT_MS ? parsed : nowMs;
}

/**
 * Decide whether a phone report is worth writing. Reports that only repeat the
 * previous level keep the existing timestamp (and produce no commit).
 */
export function shouldWriteBattery(previous, level, charging, minLevelDelta = DEFAULT_MIN_LEVEL_DELTA) {
    if (!previous || typeof previous !== "object") return true;
    if (typeof previous.level !== "number" || !Number.isFinite(previous.level)) return true;
    if (previous.charging !== charging) return true;
    const delta = Number(minLevelDelta);
    const threshold = Number.isFinite(delta) && delta >= 0 ? delta : DEFAULT_MIN_LEVEL_DELTA;
    return Math.abs(previous.level - level) >= threshold;
}

export function buildBatterySnapshot({ level, charging, reportedAtMs, nowMs = Date.now() }) {
    const reported = Number.isFinite(Number(reportedAtMs)) ? Number(reportedAtMs) : nowMs;
    const safeLevel = clamp(Math.round(Number(level)), 0, 100);
    const iso = new Date(reported).toISOString();
    return {
        schemaVersion: 1,
        level: safeLevel,
        charging: Boolean(charging),
        updatedAt: iso,
        reportedAt: iso,
        source: "android",
    };
}
