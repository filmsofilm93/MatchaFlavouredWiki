// Small shared helpers for the data pipeline.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const cacheRoot = path.join(projectRoot, ".matcha-cache");

export function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

// Some pack files start with a UTF-8 byte order mark.
export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function readJson(file) {
  try {
    return JSON.parse(stripBom(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

export function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

export function writeJsonAtomic(file, value, { pretty = true } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.next`;
  fs.writeFileSync(
    temporary,
    `${pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)}\n`,
  );
  fs.renameSync(temporary, file);
}

export function sha1(buffer) {
  return crypto.createHash("sha1").update(buffer).digest("hex");
}

export function sha1File(file) {
  return sha1(fs.readFileSync(file));
}

export function normalizeId(value, defaultNamespace = "minecraft") {
  if (!value || typeof value !== "string") return "";
  const clean = value.replace(/^#/, "");
  return clean.includes(":") ? clean : `${defaultNamespace}:${clean}`;
}

export function splitId(value) {
  const normalized = normalizeId(value);
  const separator = normalized.indexOf(":");
  return [normalized.slice(0, separator), normalized.slice(separator + 1)];
}

export function titleCase(value) {
  return String(value)
    .replace(/^.*:/, "")
    .replace(/[/.]/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function slugify(id) {
  return String(id).replace(":", "--").replaceAll("/", "--");
}

export function toPosix(file) {
  return file.split(path.sep).join("/");
}

export function arg(name, fallback = "") {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

export function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

// Number providers used by loot tables and trades: constants, uniform and
// binomial ranges. Returns { min, max, mean }.
export function numberRange(provider, fallback = 1) {
  if (provider === undefined || provider === null) {
    return { min: fallback, max: fallback, mean: fallback };
  }
  if (typeof provider === "number") {
    return { min: provider, max: provider, mean: provider };
  }
  const type = String(provider.type || "").replace(/^minecraft:/, "");
  if (type === "constant") return numberRange(provider.value, fallback);
  if (type === "binomial") {
    const n = numberRange(provider.n, 0).mean;
    const p = numberRange(provider.p, 0).mean;
    return { min: 0, max: n, mean: n * p };
  }
  if ("min" in provider || "max" in provider || type === "uniform") {
    const min = numberRange(provider.min, 0).min;
    const max = numberRange(provider.max, min).max;
    return { min, max, mean: (min + max) / 2 };
  }
  return { min: fallback, max: fallback, mean: fallback, unknown: true };
}
