import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
    extractTokens,
    fetchCodex,
    jwtClaims,
    mapUsagePayload,
} from "../lib/codex.mjs";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const TOKEN_URL = "https://auth.openai.com/oauth/token";

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function makeJwt(payload) {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${header}.${body}.signature`;
}

function tempAuth(value) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "live-status-codex-"));
    const authFile = path.join(directory, "auth.json");
    fs.writeFileSync(authFile, JSON.stringify(value), "utf8");
    return { directory, authFile };
}

test("codex: maps primary/secondary windows and reset times", () => {
    const now = Date.parse("2026-11-04T08:00:00.000Z");
    const payload = {
        plan_type: "plus",
        rate_limit: {
            allowed: true,
            limit_reached: false,
            primary_window: {
                used_percent: 36,
                limit_window_seconds: 18000,
                reset_at: 1762260300,
            },
            secondary_window: {
                used_percent: 58,
                limit_window_seconds: 604800,
                reset_after_seconds: 43200,
            },
        },
    };

    const result = mapUsagePayload(payload, now);

    assert.equal(result.ok, true);
    assert.equal(result.planType, "plus");
    assert.equal(result.limitReached, false);
    assert.equal(result.primary.usedPercent, 36);
    assert.equal(result.primary.remainingPercent, 64);
    assert.equal(result.primary.windowSeconds, 18000);
    assert.equal(result.primary.resetAt, new Date(1762260300 * 1000).toISOString());
    assert.equal(result.secondary.remainingPercent, 42);
    assert.equal(result.secondary.resetAt, new Date(now + 43200 * 1000).toISOString());
});

test("codex: accepts a data-wrapped payload and empty windows", () => {
    const wrapped = mapUsagePayload({
        data: {
            plan_type: "pro",
            rate_limit: { primary_window: { used_percent: 96, limit_window_seconds: 18000 } },
        },
    });
    assert.equal(wrapped.ok, true);
    assert.equal(wrapped.planType, "pro");
    assert.equal(wrapped.primary.remainingPercent, 4);
    assert.equal(wrapped.secondary, null);

    const emptyWindows = mapUsagePayload({ plan_type: "plus", rate_limit: {} });
    assert.equal(emptyWindows.ok, true);
    assert.equal(emptyWindows.primary, null);
    assert.equal(emptyWindows.secondary, null);

    const limited = mapUsagePayload({ rate_limit: { allowed: false, limit_reached: true } });
    assert.equal(limited.ok, true);
    assert.equal(limited.limitReached, true);
});

test("codex: rejects malformed payloads", () => {
    assert.deepEqual(mapUsagePayload(null), { ok: false, error: "bad_response" });
    assert.deepEqual(mapUsagePayload({}), { ok: false, error: "bad_response" });
    assert.deepEqual(mapUsagePayload({ rate_limit: { primary_window: { used_percent: "x" } } }), {
        ok: false,
        error: "bad_response",
    });
});

test("codex: extracts tokens and account id from nested and flat auth files", () => {
    const accessToken = makeJwt({
        exp: 2000000000,
        "https://api.openai.com/auth": { chatgpt_account_id: "acc_from_jwt" },
    });

    const nested = extractTokens({
        auth_mode: "chatgpt",
        tokens: {
            access_token: accessToken,
            refresh_token: "refresh",
            account_id: "acc_nested",
        },
    });
    assert.equal(nested.accessToken, accessToken);
    assert.equal(nested.refreshToken, "refresh");
    assert.equal(nested.accountId, "acc_nested");
    assert.equal(nested.nested, true);

    const flat = extractTokens({ access_token: accessToken, refresh_token: "flat-refresh" });
    assert.equal(flat.accountId, "acc_from_jwt");
    assert.equal(flat.nested, false);

    assert.equal(jwtClaims(accessToken).exp, 2000000000);
});

test("codex: refreshes on 401, writes the auth file, and retries once", async () => {
    const { directory, authFile } = tempAuth({
        auth_mode: "chatgpt",
        last_refresh: "2026-01-01T00:00:00.000Z",
        tokens: {
            access_token: "access-old",
            refresh_token: "refresh-old",
            account_id: "acc_1",
        },
    });

    const usageHeaders = [];
    let usageCalls = 0;
    let tokenCalls = 0;

    const fetchImpl = async (url, init) => {
        if (url === USAGE_URL) {
            usageCalls += 1;
            usageHeaders.push(init.headers);
            if (usageCalls === 1) return new Response("", { status: 401 });
            return jsonResponse({
                plan_type: "plus",
                rate_limit: {
                    primary_window: { used_percent: 10, limit_window_seconds: 18000 },
                    secondary_window: { used_percent: 20, limit_window_seconds: 604800 },
                },
            });
        }
        if (url === TOKEN_URL) {
            tokenCalls += 1;
            const body = JSON.parse(init.body);
            assert.equal(body.client_id, "app_EMoamEEZ73f0CkXaXp7hrann");
            assert.equal(body.grant_type, "refresh_token");
            assert.equal(body.refresh_token, "refresh-old");
            return jsonResponse({
                access_token: "access-new",
                refresh_token: "refresh-new",
                id_token: "id-new",
            });
        }
        throw new Error(`unexpected url: ${url}`);
    };

    try {
        const result = await fetchCodex({ authFile, fetchImpl });

        assert.equal(result.ok, true);
        assert.equal(result.primary.remainingPercent, 90);
        assert.equal(result.secondary.remainingPercent, 80);
        assert.equal(usageCalls, 2);
        assert.equal(tokenCalls, 1);
        assert.equal(usageHeaders[0]["chatgpt-account-id"], "acc_1");
        assert.equal(usageHeaders[1]["chatgpt-account-id"], "acc_1");

        const saved = JSON.parse(fs.readFileSync(authFile, "utf8"));
        assert.equal(saved.auth_mode, "chatgpt");
        assert.equal(saved.tokens.access_token, "access-new");
        assert.equal(saved.tokens.refresh_token, "refresh-new");
        assert.equal(saved.tokens.id_token, "id-new");
        assert.equal(saved.tokens.account_id, "acc_1");
        assert.equal(typeof saved.last_refresh, "string");
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test("codex: falls back to form encoding when the JSON refresh request is rejected", async () => {
    const { directory, authFile } = tempAuth({
        tokens: { access_token: "access-old", refresh_token: "refresh-old", account_id: "acc_1" },
    });

    let tokenCalls = 0;
    let usageCalls = 0;
    const fetchImpl = async (url, init) => {
        if (url === USAGE_URL) {
            usageCalls += 1;
            return usageCalls === 1
                ? new Response("", { status: 401 })
                : jsonResponse({ rate_limit: { primary_window: { used_percent: 1 } } });
        }
        if (url === TOKEN_URL) {
            tokenCalls += 1;
            if (tokenCalls === 1) {
                return new Response(JSON.stringify({ error: "invalid_request" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }
            assert.equal(init.headers["Content-Type"], "application/x-www-form-urlencoded");
            assert.match(init.body, /grant_type=refresh_token/);
            return jsonResponse({ access_token: "access-form" });
        }
        throw new Error(`unexpected url: ${url}`);
    };

    try {
        const result = await fetchCodex({ authFile, fetchImpl });
        assert.equal(result.ok, true);
        assert.equal(tokenCalls, 2);
        const saved = JSON.parse(fs.readFileSync(authFile, "utf8"));
        assert.equal(saved.tokens.access_token, "access-form");
        assert.equal(saved.tokens.refresh_token, "refresh-old");
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test("codex: reports reauth_required when the refresh fails and keeps the auth file", async () => {
    const { directory, authFile } = tempAuth({
        tokens: { access_token: "access-old", refresh_token: "refresh-old", account_id: "acc_1" },
    });
    const before = fs.readFileSync(authFile, "utf8");

    const fetchImpl = async (url) => {
        if (url === USAGE_URL) return new Response("", { status: 401 });
        if (url === TOKEN_URL) {
            return new Response(JSON.stringify({ error: "invalid_grant" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }
        throw new Error(`unexpected url: ${url}`);
    };

    try {
        const result = await fetchCodex({ authFile, fetchImpl });
        assert.deepEqual(result, { ok: false, error: "reauth_required" });
        assert.equal(fs.readFileSync(authFile, "utf8"), before);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test("codex: does not require credentials when the account is not logged in", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "live-status-codex-"));
    const missing = path.join(directory, "missing.json");
    let called = false;
    const fetchImpl = async () => {
        called = true;
        return jsonResponse({});
    };

    try {
        assert.deepEqual(await fetchCodex({ authFile: missing, fetchImpl }), {
            ok: false,
            error: "not_logged_in",
        });
        assert.equal(called, false);

        const apiKeyAuth = path.join(directory, "auth.json");
        fs.writeFileSync(apiKeyAuth, JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: "sk-test" }));
        assert.deepEqual(await fetchCodex({ authFile: apiKeyAuth, fetchImpl }), {
            ok: false,
            error: "not_logged_in",
        });
        assert.equal(called, false);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test("codex: maps network errors and upstream failures without refreshing", async () => {
    const { directory, authFile } = tempAuth({
        tokens: { access_token: "access-old", refresh_token: "refresh-old", account_id: "acc_1" },
    });
    let tokenCalls = 0;

    try {
        const network = await fetchCodex({
            authFile,
            fetchImpl: async (url) => {
                if (url === TOKEN_URL) tokenCalls += 1;
                throw new Error("offline");
            },
        });
        assert.deepEqual(network, { ok: false, error: "network_error" });
        assert.equal(tokenCalls, 0);

        const serverError = await fetchCodex({
            authFile,
            fetchImpl: async () => new Response("", { status: 500 }),
        });
        assert.deepEqual(serverError, { ok: false, error: "http_500" });
        assert.equal(tokenCalls, 0);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
