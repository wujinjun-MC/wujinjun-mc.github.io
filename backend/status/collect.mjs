#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCodex, resolveAuthFile } from "./lib/codex.mjs";
import { fetchDeepSeek } from "./lib/deepseek.mjs";
import { readJsonFile, writeJsonAtomic } from "./lib/json-file.mjs";
import { buildSnapshot } from "./lib/snapshot.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
    console.log(`Usage: node backend/status/collect.mjs [--dry-run] [--debug]

Environment:
  DEEPSEEK_API_KEY      required for the balance card
  DEEPSEEK_CURRENCY     preferred balance currency (default CNY)
  CODEX_HOME            Codex home containing auth.json (default ~/.codex)
  STATUS_OUT            output path (default <repo>/data/status.json)
  HTTP_TIMEOUT_MS       per-request timeout (default 10000)

Testing overrides:
  DEEPSEEK_BASE_URL, CODEX_USAGE_URL, CODEX_TOKEN_URL

The script never prints tokens or raw upstream responses.`);
    process.exit(0);
}

const dryRun = args.has("--dry-run");
const debug = args.has("--debug");
const outputPath = process.env.STATUS_OUT
    ? path.resolve(process.env.STATUS_OUT)
    : path.join(repoRoot, "data", "status.json");
const timeoutMs = Number(process.env.HTTP_TIMEOUT_MS) > 0 ? Number(process.env.HTTP_TIMEOUT_MS) : undefined;

function log(message) {
    console.log(message);
}

function summarizeDeepSeek(metric) {
    if (!metric || metric.ok !== true) return `fail (${(metric && metric.error) || "unknown"})`;
    return `ok (${metric.currency} ${metric.total})`;
}

function summarizeCodex(metric) {
    if (!metric || metric.ok !== true) return `fail (${(metric && metric.error) || "unknown"})`;
    const primary = metric.primary ? `${metric.primary.remainingPercent}%` : "-";
    const secondary = metric.secondary ? `${metric.secondary.remainingPercent}%` : "-";
    return `ok (${metric.planType || "unknown"}, 5h ${primary}, week ${secondary})`;
}

async function runMetric(name, task) {
    try {
        return await task();
    } catch (error) {
        log(`${name}: unexpected error (${error && error.name ? error.name : "unknown"})`);
        return { ok: false, error: "unknown" };
    }
}

async function main() {
    let previous = null;
    try {
        previous = readJsonFile(outputPath);
    } catch {
        log(`warning: ${outputPath} is not valid JSON; rebuilding from scratch`);
    }

    if (debug) {
        const authFile = resolveAuthFile();
        log(`debug: auth file = ${authFile} (exists: ${fs.existsSync(authFile)})`);
        log(`debug: status output = ${outputPath}`);
        log(`debug: deepseek key configured: ${Boolean(process.env.DEEPSEEK_API_KEY)}`);
    }

    const [deepseek, codex] = await Promise.all([
        runMetric("deepseek", () => fetchDeepSeek({
            timeoutMs,
            baseUrl: process.env.DEEPSEEK_BASE_URL,
        })),
        runMetric("codex", () => fetchCodex({
            timeoutMs,
            usageUrl: process.env.CODEX_USAGE_URL,
            tokenUrl: process.env.CODEX_TOKEN_URL,
        })),
    ]);

    log(`deepseek: ${summarizeDeepSeek(deepseek)}`);
    log(`codex: ${summarizeCodex(codex)}`);

    const { changed, snapshot } = buildSnapshot(previous, { deepseek, codex });

    if (dryRun) {
        log("dry-run: not writing");
        console.log(JSON.stringify(snapshot, null, 2));
        return;
    }

    if (!changed) {
        log("snapshot unchanged");
        return;
    }

    writeJsonAtomic(outputPath, snapshot);
    log(`snapshot written: ${outputPath}`);
}

main().catch((error) => {
    console.error(`collector failed: ${error && error.message ? error.message : "unknown error"}`);
    process.exitCode = 1;
});
