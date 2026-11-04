import { httpErrorCode, requestJson } from "./http.mjs";

const DEFAULT_BASE_URL = "https://api.deepseek.com";

function toNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number.parseFloat(String(value));
    return Number.isFinite(number) ? number : null;
}

function pickBalance(balances, preferredCurrency) {
    const list = Array.isArray(balances) ? balances.filter((item) => item && typeof item === "object") : [];
    if (list.length === 0) return null;
    if (preferredCurrency) {
        const preferred = list.find((item) => String(item.currency || "").toUpperCase() === preferredCurrency);
        if (preferred) return preferred;
    }
    return list[0];
}

/**
 * Fetch the DeepSeek account balance.
 * Returns a serialisable metric object; never includes the API key.
 */
export async function fetchDeepSeek(options = {}) {
    const apiKey = options.apiKey !== undefined ? options.apiKey : process.env.DEEPSEEK_API_KEY;
    const preferredCurrency = String(
        options.currency !== undefined ? options.currency : process.env.DEEPSEEK_CURRENCY || "CNY"
    ).toUpperCase();
    const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const timeoutMs = options.timeoutMs;

    if (!apiKey) {
        return { ok: false, error: "not_configured" };
    }

    const result = await requestJson(
        `${baseUrl}/user/balance`,
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: "application/json",
            },
        },
        { fetchImpl, timeoutMs }
    );

    if (!result.ok) {
        if (result.error) return { ok: false, error: result.error };
        if (result.status === 401 || result.status === 403) return { ok: false, error: "auth_failed" };
        if (result.status === 429) return { ok: false, error: "rate_limited" };
        return { ok: false, error: httpErrorCode(result.status) };
    }

    const payload = result.data;
    if (!payload || typeof payload !== "object") {
        return { ok: false, error: "bad_response" };
    }

    const balance = pickBalance(payload.balance_infos, preferredCurrency);
    const total = balance ? toNumber(balance.total_balance) : null;
    if (!balance || total === null) {
        return { ok: false, error: "bad_response" };
    }

    return {
        ok: true,
        currency: typeof balance.currency === "string" ? balance.currency : preferredCurrency,
        total,
        granted: toNumber(balance.granted_balance),
        toppedUp: toNumber(balance.topped_up_balance),
        available: payload.is_available !== false,
    };
}
