import assert from "node:assert/strict";
import test from "node:test";
import { fetchDeepSeek } from "../lib/deepseek.mjs";

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

test("deepseek: prefers CNY and maps balances", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        return jsonResponse({
            is_available: true,
            balance_infos: [
                { currency: "USD", total_balance: "1.00", granted_balance: "0", topped_up_balance: "1.00" },
                { currency: "CNY", total_balance: "42.50", granted_balance: "5.00", topped_up_balance: "37.50" },
            ],
        });
    };

    const result = await fetchDeepSeek({ apiKey: "secret-key", fetchImpl });

    assert.equal(result.ok, true);
    assert.equal(result.currency, "CNY");
    assert.equal(result.total, 42.5);
    assert.equal(result.granted, 5);
    assert.equal(result.toppedUp, 37.5);
    assert.equal(result.available, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/user\/balance$/);
    assert.equal(calls[0].init.headers.Authorization, "Bearer secret-key");
});

test("deepseek: falls back to the first balance when CNY is absent", async () => {
    const fetchImpl = async () => jsonResponse({
        is_available: true,
        balance_infos: [{ currency: "USD", total_balance: "3.25" }],
    });

    const result = await fetchDeepSeek({ apiKey: "key", fetchImpl });

    assert.equal(result.ok, true);
    assert.equal(result.currency, "USD");
    assert.equal(result.total, 3.25);
    assert.equal(result.granted, null);
    assert.equal(result.toppedUp, null);
});

test("deepseek: reports missing key without calling the network", async () => {
    let called = false;
    const result = await fetchDeepSeek({
        apiKey: "",
        fetchImpl: async () => {
            called = true;
            return jsonResponse({});
        },
    });

    assert.deepEqual(result, { ok: false, error: "not_configured" });
    assert.equal(called, false);
});

test("deepseek: maps 401 to auth_failed", async () => {
    const result = await fetchDeepSeek({
        apiKey: "bad",
        fetchImpl: async () => jsonResponse({ error: "unauthorized" }, 401),
    });

    assert.deepEqual(result, { ok: false, error: "auth_failed" });
});

test("deepseek: maps 429 and 5xx", async () => {
    const rateLimited = await fetchDeepSeek({
        apiKey: "key",
        fetchImpl: async () => jsonResponse({}, 429),
    });
    assert.equal(rateLimited.error, "rate_limited");

    const serverError = await fetchDeepSeek({
        apiKey: "key",
        fetchImpl: async () => jsonResponse({}, 503),
    });
    assert.equal(serverError.error, "http_503");
});

test("deepseek: rejects malformed payloads", async () => {
    const noBalances = await fetchDeepSeek({
        apiKey: "key",
        fetchImpl: async () => jsonResponse({ is_available: true, balance_infos: [] }),
    });
    assert.deepEqual(noBalances, { ok: false, error: "bad_response" });

    const badNumber = await fetchDeepSeek({
        apiKey: "key",
        fetchImpl: async () => jsonResponse({
            balance_infos: [{ currency: "CNY", total_balance: "not-a-number" }],
        }),
    });
    assert.deepEqual(badNumber, { ok: false, error: "bad_response" });

    const notJson = await fetchDeepSeek({
        apiKey: "key",
        fetchImpl: async () => new Response("<html>blocked</html>", { status: 200 }),
    });
    assert.deepEqual(notJson, { ok: false, error: "bad_response" });
});

test("deepseek: maps network and timeout failures", async () => {
    const network = await fetchDeepSeek({
        apiKey: "key",
        fetchImpl: async () => {
            throw new Error("offline");
        },
    });
    assert.deepEqual(network, { ok: false, error: "network_error" });

    const timeout = await fetchDeepSeek({
        apiKey: "key",
        fetchImpl: async () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            throw error;
        },
    });
    assert.deepEqual(timeout, { ok: false, error: "timeout" });
});
