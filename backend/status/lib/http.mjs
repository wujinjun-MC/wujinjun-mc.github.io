/**
 * Minimal JSON-over-HTTP helper for the live-status collector.
 * No dependencies; every request takes an injectable fetch so tests stay offline.
 */

export const DEFAULT_TIMEOUT_MS = 10000;

/**
 * @param {string} url
 * @param {RequestInit} init
 * @param {{ fetchImpl?: Function, timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, status: number, data: unknown, error?: string }>}
 */
export async function requestJson(url, init = {}, options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const timeoutMs = Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0
        ? Number(options.timeoutMs)
        : DEFAULT_TIMEOUT_MS;

    if (typeof fetchImpl !== "function") {
        return { ok: false, status: 0, data: null, error: "network_error" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetchImpl(url, { ...init, signal: controller.signal });
        const text = await response.text();
        let data = null;
        if (text) {
            try {
                data = JSON.parse(text);
            } catch {
                data = null;
            }
        }
        return { ok: response.ok, status: response.status, data };
    } catch (error) {
        const errorName = error && typeof error === "object" ? error.name : "";
        return {
            ok: false,
            status: 0,
            data: null,
            error: errorName === "AbortError" ? "timeout" : "network_error",
        };
    } finally {
        clearTimeout(timer);
    }
}

export function httpErrorCode(status) {
    const code = Number(status);
    return Number.isInteger(code) && code > 0 ? `http_${code}` : "network_error";
}
