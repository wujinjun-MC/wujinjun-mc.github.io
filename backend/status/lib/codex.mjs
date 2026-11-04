import os from "node:os";
import path from "node:path";
import { httpErrorCode, requestJson } from "./http.mjs";
import { readJsonFile, writeJsonAtomic } from "./json-file.mjs";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const SCOPE = "openid profile email";

function asString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function round1(value) {
    return Math.round(value * 10) / 10;
}

export function resolveAuthFile(env = process.env) {
    const codexHome = env && env.CODEX_HOME && String(env.CODEX_HOME).trim();
    const home = codexHome || path.join(os.homedir(), ".codex");
    return path.join(home, "auth.json");
}

/** Decode a JWT payload without verifying the signature. Never logs the token. */
export function jwtClaims(token) {
    if (typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    try {
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
        const parsed = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}

function accountIdFromClaims(claims) {
    if (!claims || typeof claims !== "object") return null;
    const authClaim = claims["https://api.openai.com/auth"];
    if (authClaim && typeof authClaim === "object") {
        const found = asString(authClaim.chatgpt_account_id) || asString(authClaim.account_id);
        if (found) return found;
    }
    const direct = asString(claims.chatgpt_account_id);
    if (direct) return direct;
    if (Array.isArray(claims.organizations) && claims.organizations[0]) {
        return asString(claims.organizations[0].id);
    }
    return null;
}

/**
 * Accept both the current nested Codex auth shape ({ tokens: {...} }) and the
 * older flat shape, so a CLI update does not silently break the collector.
 */
export function extractTokens(auth) {
    if (!auth || typeof auth !== "object") {
        return { accessToken: null, refreshToken: null, idToken: null, accountId: null, nested: false };
    }
    const nested = auth.tokens && typeof auth.tokens === "object" ? auth.tokens : null;
    const source = nested || auth;
    const accessToken = asString(source.access_token);
    const refreshToken = asString(source.refresh_token);
    const idToken = asString(source.id_token);
    let accountId = asString(source.account_id) || asString(auth.account_id);
    if (!accountId && accessToken) accountId = accountIdFromClaims(jwtClaims(accessToken));
    if (!accountId && idToken) accountId = accountIdFromClaims(jwtClaims(idToken));
    return { accessToken, refreshToken, idToken, accountId, nested: Boolean(nested) };
}

/** Map a /wham/usage payload into the public status contract. */
export function mapUsagePayload(payload, nowMs = Date.now()) {
    let root = payload;
    if (root && typeof root === "object" && root.data && typeof root.data === "object") {
        root = root.data;
    }
    if (!root || typeof root !== "object" || Array.isArray(root)) {
        return { ok: false, error: "bad_response" };
    }
    const rateLimit = root.rate_limit && typeof root.rate_limit === "object" ? root.rate_limit : root;
    const hasKnownShape = Boolean(root.rate_limit) || typeof root.plan_type === "string"
        || Boolean(root.primary_window) || Boolean(root.secondary_window);
    if (!hasKnownShape) {
        return { ok: false, error: "bad_response" };
    }
    const primaryRaw = rateLimit.primary_window;
    const secondaryRaw = rateLimit.secondary_window;
    const primary = mapWindow(primaryRaw, nowMs);
    const secondary = mapWindow(secondaryRaw, nowMs);
    if ((primaryRaw && typeof primaryRaw === "object" && !primary)
        || (secondaryRaw && typeof secondaryRaw === "object" && !secondary)) {
        return { ok: false, error: "bad_response" };
    }
    return {
        ok: true,
        planType: typeof root.plan_type === "string" ? root.plan_type : null,
        primary,
        secondary,
        limitReached: rateLimit.limit_reached === true || rateLimit.allowed === false,
    };
}

function mapWindow(window, nowMs) {
    if (!window || typeof window !== "object") return null;
    const usedRaw = Number(window.used_percent);
    if (!Number.isFinite(usedRaw)) return null;
    const used = clamp(usedRaw, 0, 100);
    const windowSeconds = Number.isFinite(Number(window.limit_window_seconds))
        ? Number(window.limit_window_seconds)
        : null;

    let resetAt = null;
    const resetAtSeconds = Number(window.reset_at);
    if (Number.isFinite(resetAtSeconds) && resetAtSeconds > 0) {
        resetAt = new Date(resetAtSeconds * 1000).toISOString();
    } else {
        const resetAfterSeconds = Number(window.reset_after_seconds);
        if (Number.isFinite(resetAfterSeconds) && resetAfterSeconds >= 0) {
            resetAt = new Date(nowMs + resetAfterSeconds * 1000).toISOString();
        }
    }

    return {
        usedPercent: round1(used),
        remainingPercent: round1(100 - used),
        windowSeconds,
        resetAt,
    };
}

async function getUsage({ accessToken, accountId, fetchImpl, timeoutMs, usageUrl }) {
    const headers = {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        originator: "codex_cli_rs",
    };
    if (accountId) headers["chatgpt-account-id"] = accountId;
    const result = await requestJson(usageUrl || USAGE_URL, { method: "GET", headers }, { fetchImpl, timeoutMs });
    return result;
}

async function tokenRequest(body, asJson, { fetchImpl, timeoutMs, tokenUrl }) {
    const headers = asJson
        ? { "Content-Type": "application/json", Accept: "application/json" }
        : { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
    const payload = asJson ? JSON.stringify(body) : new URLSearchParams(body).toString();
    return requestJson(tokenUrl || TOKEN_URL, { method: "POST", headers, body: payload }, { fetchImpl, timeoutMs });
}

function classifyRefreshFailure(result) {
    if (result.error) return result.error;
    const payloadError = result.data && typeof result.data === "object" ? result.data.error : null;
    if (payloadError === "invalid_grant" || payloadError === "invalid_request") return "reauth_required";
    if (result.status === 400 || result.status === 401 || result.status === 403) return "reauth_required";
    if (result.status === 429) return "rate_limited";
    return httpErrorCode(result.status);
}

function applyRefreshedTokens(auth, payload, nowIso) {
    const next = { ...auth };
    const nested = auth.tokens && typeof auth.tokens === "object" ? { ...auth.tokens } : null;
    const target = nested || next;
    const accessToken = asString(payload.access_token);
    const refreshToken = asString(payload.refresh_token);
    const idToken = asString(payload.id_token);
    if (accessToken) target.access_token = accessToken;
    if (refreshToken) target.refresh_token = refreshToken;
    if (idToken) target.id_token = idToken;
    if (nested) next.tokens = target;
    next.last_refresh = nowIso;
    return next;
}

async function refreshAuth({ auth, authFile, fetchImpl, timeoutMs, tokenUrl }) {
    const tokens = extractTokens(auth);
    if (!tokens.refreshToken) return { ok: false, error: "reauth_required" };

    const body = {
        client_id: CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
        scope: SCOPE,
    };

    let result = await tokenRequest(body, true, { fetchImpl, timeoutMs, tokenUrl });
    if (!result.ok) {
        result = await tokenRequest(body, false, { fetchImpl, timeoutMs, tokenUrl });
    }
    if (!result.ok) {
        return { ok: false, error: classifyRefreshFailure(result) };
    }
    const payload = result.data;
    if (!payload || typeof payload !== "object" || !asString(payload.access_token)) {
        return { ok: false, error: "reauth_required" };
    }

    const nextAuth = applyRefreshedTokens(auth, payload, new Date().toISOString());
    try {
        writeJsonAtomic(authFile, nextAuth, { mode: 0o600 });
    } catch {
        return { ok: false, error: "reauth_required" };
    }
    return { ok: true, auth: nextAuth };
}

/**
 * Read the local Codex OAuth session, query the undocumented usage endpoint,
 * and refresh the session once if the access token is rejected.
 *
 * The auth file is only written after a successful refresh, and it keeps the
 * CLI's own token store in sync, so the CLI and the collector do not diverge.
 */
export async function fetchCodex(options = {}) {
    const env = options.env || process.env;
    const authFile = options.authFile || resolveAuthFile(env);
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const timeoutMs = options.timeoutMs;
    const usageUrl = options.usageUrl || env.CODEX_USAGE_URL || USAGE_URL;
    const tokenUrl = options.tokenUrl || env.CODEX_TOKEN_URL || TOKEN_URL;

    let auth;
    try {
        auth = readJsonFile(authFile);
    } catch {
        return { ok: false, error: "bad_response" };
    }
    if (!auth) return { ok: false, error: "not_logged_in" };

    let tokens = extractTokens(auth);
    if (!tokens.accessToken) return { ok: false, error: "not_logged_in" };

    let usage = await getUsage({ ...tokens, fetchImpl, timeoutMs, usageUrl });

    if (!usage.ok && (usage.status === 401 || usage.status === 403)) {
        const refreshed = await refreshAuth({ auth, authFile, fetchImpl, timeoutMs, tokenUrl });
        if (!refreshed.ok) return { ok: false, error: refreshed.error };
        tokens = extractTokens(refreshed.auth);
        usage = await getUsage({ ...tokens, fetchImpl, timeoutMs, usageUrl });
    }

    if (!usage.ok) {
        if (usage.error) return { ok: false, error: usage.error };
        if (usage.status === 401) return { ok: false, error: "reauth_required" };
        if (usage.status === 400 || usage.status === 403) return { ok: false, error: "account_mismatch" };
        if (usage.status === 429) return { ok: false, error: "rate_limited" };
        return { ok: false, error: httpErrorCode(usage.status) };
    }

    return mapUsagePayload(usage.data);
}
