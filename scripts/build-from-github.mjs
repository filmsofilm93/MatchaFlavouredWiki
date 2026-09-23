// Build the wiki data straight from the official GitHub repository
// (https://github.com/kleiwright/matcha-flavoured) instead of Modrinth.
// Kept for the documented command; it is `update-matcha.mjs --only=github`.
//
//   node scripts/build-from-github.mjs [--ref=<commit|branch|tag>]
//        [--vanilla=mojang|mcmeta] [--dry-run [--out=<file>]]
//
// Without --ref it builds GitHub main, published as the "unreleased" entry
// of the version switcher.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "update-matcha.mjs");
const args = process.argv.slice(2).filter((value) => !value.startsWith("--only="));
const result = spawnSync(process.execPath, [script, "--only=github", ...args], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
