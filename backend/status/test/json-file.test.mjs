import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readJsonFile, writeJsonAtomic } from "../lib/json-file.mjs";

test("json-file: missing files read as null and writes are atomic", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "live-status-json-"));
    const file = path.join(directory, "nested", "status.json");
    try {
        assert.equal(readJsonFile(file), null);
        writeJsonAtomic(file, { schemaVersion: 1, value: "ok" });
        assert.deepEqual(readJsonFile(file), { schemaVersion: 1, value: "ok" });
        assert.equal(fs.existsSync(`${file}.${process.pid}.tmp`), false);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test("json-file: malformed JSON throws for the caller to handle", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "live-status-json-"));
    const file = path.join(directory, "broken.json");
    try {
        fs.writeFileSync(file, "{not json", "utf8");
        assert.throws(() => readJsonFile(file), SyntaxError);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
