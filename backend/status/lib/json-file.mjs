import fs from "node:fs";
import path from "node:path";

/**
 * Read a JSON file. Returns null when the file is absent.
 * A malformed file throws so the caller can decide how to degrade.
 */
export function readJsonFile(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
        if (error && error.code === "ENOENT") return null;
        throw error;
    }
}

/**
 * Write pretty JSON via a temporary sibling file + rename, so a crash never
 * leaves a half-written status file behind. Pass { mode: 0o600 } for secrets
 * such as the refreshed Codex auth file.
 */
export function writeJsonAtomic(filePath, value, options = {}) {
    const directory = path.dirname(filePath);
    fs.mkdirSync(directory, { recursive: true });
    const tempPath = `${filePath}.${process.pid}.tmp`;
    const body = `${JSON.stringify(value, null, 2)}\n`;
    const mode = Number.isInteger(options.mode) ? options.mode : 0o666;
    fs.writeFileSync(tempPath, body, { encoding: "utf8", mode });
    fs.renameSync(tempPath, filePath);
}
