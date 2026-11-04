import assert from "node:assert/strict";
import test from "node:test";
import { buildSnapshot } from "../lib/snapshot.mjs";

const T0 = Date.parse("2026-11-04T08:00:00.000Z");
const T1 = Date.parse("2026-11-04T08:15:00.000Z");

const deepseek = { ok: true, currency: "CNY", total: 42.5, granted: 5, toppedUp: 37.5, available: true };
const codex = {
    ok: true,
    planType: "plus",
    primary: { usedPercent: 36, remainingPercent: 64, windowSeconds: 18000, resetAt: "2026-11-04T10:00:00.000Z" },
    secondary: { usedPercent: 58, remainingPercent: 42, windowSeconds: 604800, resetAt: "2026-11-07T00:00:00.000Z" },
    limitReached: false,
};

test("snapshot: first run writes schema, values and timestamps", () => {
    const { changed, snapshot } = buildSnapshot(null, { deepseek, codex }, T0);
    assert.equal(changed, true);
    assert.equal(snapshot.schemaVersion, 1);
    assert.equal(snapshot.generatedAt, new Date(T0).toISOString());
    assert.equal(snapshot.deepseek.total, 42.5);
    assert.equal(snapshot.deepseek.ok, true);
    assert.equal(snapshot.deepseek.updatedAt, new Date(T0).toISOString());
    assert.equal(snapshot.codex.primary.remainingPercent, 64);
});

test("snapshot: unchanged values keep the previous document and timestamps", () => {
    const first = buildSnapshot(null, { deepseek, codex }, T0).snapshot;
    const second = buildSnapshot(first, { deepseek, codex }, T1);
    assert.equal(second.changed, false);
    assert.equal(second.snapshot, first);
    assert.equal(second.snapshot.deepseek.updatedAt, new Date(T0).toISOString());
});

test("snapshot: a changed value gets a new timestamp and generatedAt", () => {
    const first = buildSnapshot(null, { deepseek, codex }, T0).snapshot;
    const changedDeepSeek = { ...deepseek, total: 40 };
    const second = buildSnapshot(first, { deepseek: changedDeepSeek, codex }, T1);

    assert.equal(second.changed, true);
    assert.equal(second.snapshot.generatedAt, new Date(T1).toISOString());
    assert.equal(second.snapshot.deepseek.total, 40);
    assert.equal(second.snapshot.deepseek.updatedAt, new Date(T1).toISOString());
    assert.equal(second.snapshot.codex.updatedAt, new Date(T0).toISOString());
});

test("snapshot: failures preserve the last good value and expose a code", () => {
    const first = buildSnapshot(null, { deepseek, codex }, T0).snapshot;
    const failed = buildSnapshot(first, { deepseek: { ok: false, error: "auth_failed" }, codex }, T1);

    assert.equal(failed.changed, true);
    assert.equal(failed.snapshot.deepseek.ok, false);
    assert.equal(failed.snapshot.deepseek.error, "auth_failed");
    assert.equal(failed.snapshot.deepseek.total, 42.5);
    assert.equal(failed.snapshot.deepseek.updatedAt, new Date(T0).toISOString());
    assert.equal(failed.snapshot.codex.ok, true);

    const repeated = buildSnapshot(failed.snapshot, { deepseek: { ok: false, error: "auth_failed" }, codex }, T1 + 900000);
    assert.equal(repeated.changed, false);
});

test("snapshot: a metric that never succeeded stores only the error", () => {
    const { changed, snapshot } = buildSnapshot(null, {
        deepseek: { ok: false, error: "not_configured" },
        codex: { ok: false, error: "not_logged_in" },
    }, T0);

    assert.equal(changed, true);
    assert.deepEqual(snapshot.deepseek, { ok: false, error: "not_configured", updatedAt: null });
    assert.deepEqual(snapshot.codex, { ok: false, error: "not_logged_in", updatedAt: null });
});

test("snapshot: recovery after an error clears the error and refreshes the value", () => {
    const first = buildSnapshot(null, { deepseek, codex }, T0).snapshot;
    const failed = buildSnapshot(first, { deepseek: { ok: false, error: "network_error" }, codex }, T0 + 60000).snapshot;
    const recovered = buildSnapshot(failed, { deepseek, codex }, T1);

    assert.equal(recovered.changed, true);
    assert.equal(recovered.snapshot.deepseek.ok, true);
    assert.equal("error" in recovered.snapshot.deepseek, false);
    assert.equal(recovered.snapshot.deepseek.updatedAt, new Date(T1).toISOString());
});
