#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    buildBatterySnapshot,
    parseCharging,
    parseLevel,
    parseReportedAt,
    shouldWriteBattery,
} from "./lib/battery.mjs";
import { readJsonFile, writeJsonAtomic } from "./lib/json-file.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const outputPath = process.env.STATUS_BATTERY_OUT
    ? path.resolve(process.env.STATUS_BATTERY_OUT)
    : path.join(repoRoot, "data", "battery.json");
const nowMs = Date.now();

const level = parseLevel(process.env.LEVEL);
if (level === null) {
    console.error(`invalid LEVEL: ${process.env.LEVEL === undefined ? "(missing)" : process.env.LEVEL}`);
    process.exit(1);
}

const charging = parseCharging(process.env.CHARGING);
const reportedAtMs = parseReportedAt(process.env.TS, nowMs);
const minLevelDelta = Number(process.env.MIN_LEVEL_DELTA) >= 0 ? Number(process.env.MIN_LEVEL_DELTA) : 2;

let previous = null;
try {
    previous = readJsonFile(outputPath);
} catch {
    console.error(`warning: ${outputPath} is not valid JSON; overwriting`);
}

if (!shouldWriteBattery(previous, level, charging, minLevelDelta)) {
    console.log(`unchanged (level ${level}%, charging ${charging})`);
    process.exit(0);
}

const snapshot = buildBatterySnapshot({ level, charging, reportedAtMs, nowMs });
writeJsonAtomic(outputPath, snapshot);
console.log(`written: ${snapshot.level}% charging=${snapshot.charging} at ${snapshot.updatedAt}`);
