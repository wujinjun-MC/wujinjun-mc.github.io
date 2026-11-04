import assert from "node:assert/strict";
import test from "node:test";
import {
    buildBatterySnapshot,
    parseCharging,
    parseLevel,
    parseReportedAt,
    shouldWriteBattery,
} from "../lib/battery.mjs";

test("battery: parses valid levels and rejects invalid ones", () => {
    assert.equal(parseLevel("87"), 87);
    assert.equal(parseLevel(0), 0);
    assert.equal(parseLevel("100"), 100);
    assert.equal(parseLevel("101"), null);
    assert.equal(parseLevel("-1"), null);
    assert.equal(parseLevel("87.5"), null);
    assert.equal(parseLevel("hello"), null);
    assert.equal(parseLevel(""), null);
    assert.equal(parseLevel(undefined), null);
});

test("battery: parses charging states", () => {
    assert.equal(parseCharging("true"), true);
    assert.equal(parseCharging("1"), true);
    assert.equal(parseCharging("CHARGING"), true);
    assert.equal(parseCharging("false"), false);
    assert.equal(parseCharging("0"), false);
    assert.equal(parseCharging(""), false);
    assert.equal(parseCharging(undefined), false);
});

test("battery: accepts recent phone timestamps and clamps old or future ones", () => {
    const now = Date.parse("2026-11-04T08:00:00.000Z");
    assert.equal(parseReportedAt(String(now / 1000), now), now);
    assert.equal(parseReportedAt(new Date(now - 60000).toISOString(), now), now - 60000);
    assert.equal(parseReportedAt(String((now - 3600000) / 1000), now), now);
    assert.equal(parseReportedAt("not-a-date", now), now);
    assert.equal(parseReportedAt("", now), now);
});

test("battery: only writes when the level or charging state materially changed", () => {
    const previous = { level: 80, charging: false };
    assert.equal(shouldWriteBattery(previous, 80, false), false);
    assert.equal(shouldWriteBattery(previous, 81, false), false);
    assert.equal(shouldWriteBattery(previous, 82, false), true);
    assert.equal(shouldWriteBattery(previous, 78, false), true);
    assert.equal(shouldWriteBattery(previous, 80, true), true);
    assert.equal(shouldWriteBattery(null, 80, false), true);
    assert.equal(shouldWriteBattery({ charging: false }, 80, false), true);
    assert.equal(shouldWriteBattery(previous, 83, false, 5), false);
    assert.equal(shouldWriteBattery(previous, 85, false, 5), true);
});

test("battery: builds a valid snapshot", () => {
    const now = Date.parse("2026-11-04T08:00:00.000Z");
    const snapshot = buildBatterySnapshot({ level: 87, charging: true, reportedAtMs: now - 60000, nowMs: now });

    assert.equal(snapshot.schemaVersion, 1);
    assert.equal(snapshot.level, 87);
    assert.equal(snapshot.charging, true);
    assert.equal(snapshot.updatedAt, new Date(now - 60000).toISOString());
    assert.equal(snapshot.reportedAt, snapshot.updatedAt);
    assert.equal(snapshot.source, "android");
});
