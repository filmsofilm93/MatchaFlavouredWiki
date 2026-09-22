import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const cacheRoot = path.join(projectRoot, ".matcha-cache");
const liveDataFile = path.join(projectRoot, "app/data/wiki-data.json");
const updaterStateFile = path.join(cacheRoot, "current.json");
const projectSlug = "matcha-flavoured";
const modrinthApi = "https://api.modrinth.com/v2";
const mojangManifestUrl =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const userAgent = "matcha-flavoured-field-wiki/0.1.0 (local-development)";

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.next`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function sha1File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha1");
    const stream = fs.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent,
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: { "User-Agent": userAgent },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.part`;
  await pipeline(
    Readable.fromWeb(response.body),
    fs.createWriteStream(temporary),
  );
  fs.renameSync(temporary, destination);
}

function unzip(archive, destination, patterns = []) {
  fs.mkdirSync(destination, { recursive: true });
  const result = spawnSync(
    "unzip",
    ["-q", "-o", archive, ...patterns, "-d", destination],
    { cwd: projectRoot, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Could not extract ${path.basename(archive)}.`);
  }
}

function findPackRoot(extractedRoot) {
  if (
    fs.existsSync(path.join(extractedRoot, "data")) &&
    fs.existsSync(path.join(extractedRoot, "assets"))
  ) {
    return extractedRoot;
  }
  const nested = fs
    .readdirSync(extractedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(extractedRoot, entry.name))
    .find(
      (directory) =>
        fs.existsSync(path.join(directory, "data")) &&
        fs.existsSync(path.join(directory, "assets")),
    );
  if (!nested) {
    throw new Error(
      "The downloaded Matcha Flavoured archive has no data/assets root.",
    );
  }
  return nested;
}

function primaryFile(version) {
  return (
    version.files.find((file) => file.primary) ||
    version.files.find((file) => file.filename.endsWith(".zip")) ||
    version.files[0]
  );
}

function cleanHighlight(line) {
  return line
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#]/g, "")
    .trim();
}

function releaseHighlights(changelog) {
  const highlights = String(changelog || "")
    .split(/\r?\n/)
    .filter((line) => /^\s*[-*+]\s+/.test(line))
    .map(cleanHighlight)
    .filter(Boolean)
    .slice(0, 3);
  return highlights.length
    ? highlights
    : [
        "Wiki data and textures synchronized from Modrinth",
        "Recipes, items, and advancements rebuilt locally",
        "All pack data extracted in full",
      ];
}

function formatReleaseDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function cleanChangelogText(line) {
  return String(line)
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_`]/g, "")
    .trim();
}

export function changelogBlocks(changelog) {
  return String(changelog || "")
    .split(/\r?\n/)
    .map((rawLine) => {
      const line = rawLine.trim();
      if (!line) return null;
      if (/^#{1,6}\s+/.test(line)) {
        return {
          type: "heading",
          text: cleanChangelogText(line.replace(/^#{1,6}\s+/, "")),
        };
      }
      if (/^[-*+]\s+/.test(line)) {
        return {
          type: "bullet",
          text: cleanChangelogText(line.replace(/^[-*+]\s+/, "")),
        };
      }
      if (/^\d+[.)]\s+/.test(line)) {
        return {
          type: "bullet",
          text: cleanChangelogText(line.replace(/^\d+[.)]\s+/, "")),
        };
      }
      return { type: "paragraph", text: cleanChangelogText(line) };
    })
    .filter((block) => block?.text);
}

function releaseChangelog(versions) {
  return versions.map((version) => ({
    versionId: version.id,
    version: version.version_number,
    name: version.name,
    published: formatReleaseDate(version.date_published),
    minecraft: version.game_versions || [],
    channel: version.version_type,
    featured: Boolean(version.featured),
    blocks: changelogBlocks(version.changelog),
  }));
}

function changelogHash(entries) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(entries))
    .digest("hex");
}

async function projectVersions() {
  const versions = await fetchJson(
    `${modrinthApi}/project/${projectSlug}/version?include_changelog=true`,
  );
  const listed = versions
    .filter((version) => version.status === "listed")
    .sort(
      (a, b) =>
        new Date(b.date_published).getTime() -
        new Date(a.date_published).getTime(),
    );
  if (!listed.length) {
    throw new Error("Modrinth returned no listed releases.");
  }
  return {
    latest: listed[0],
    changelog: releaseChangelog(listed),
  };
}

async function ensurePack(version) {
  const file = primaryFile(version);
  if (!file?.url || !file?.hashes?.sha1) {
    throw new Error("The latest Modrinth release has no verifiable file.");
  }
  const releaseRoot = path.join(cacheRoot, "releases", version.id);
  const archive = path.join(releaseRoot, path.basename(file.filename));
  const extractedRoot = path.join(releaseRoot, "unpacked");

  if (
    !fs.existsSync(archive) ||
    (await sha1File(archive)) !== file.hashes.sha1
  ) {
    await downloadFile(file.url, archive);
  }
  if ((await sha1File(archive)) !== file.hashes.sha1) {
    throw new Error("The downloaded datapack failed its SHA-1 check.");
  }
  if (!fs.existsSync(extractedRoot)) {
    unzip(archive, extractedRoot);
  }
  return {
    file,
    packRoot: findPackRoot(extractedRoot),
  };
}

export async function minecraftVersionFor(version) {
  const manifest = await fetchJson(mojangManifestUrl);
  const supported = new Set(version.game_versions || []);
  const selected = manifest.versions.find((entry) => supported.has(entry.id));
  if (!selected) {
    throw new Error(
      `No Mojang client was found for ${version.game_versions.join(", ")}.`,
    );
  }
  return {
    gameVersion: selected.id,
    metadata: await fetchJson(selected.url),
  };
}

export async function ensureVanillaAssets(gameVersion, metadata) {
  const client = metadata.downloads?.client;
  if (!client?.url || !client?.sha1) {
    throw new Error(`Minecraft ${gameVersion} has no client download.`);
  }
  const clientRoot = path.join(cacheRoot, "minecraft", gameVersion);
  const archive = path.join(clientRoot, "client.jar");
  const extractedRoot = path.join(clientRoot, "assets-root");
  if (!fs.existsSync(archive) || (await sha1File(archive)) !== client.sha1) {
    await downloadFile(client.url, archive);
  }
  if ((await sha1File(archive)) !== client.sha1) {
    throw new Error("The Minecraft client failed its SHA-1 check.");
  }
  if (!fs.existsSync(path.join(extractedRoot, "assets/minecraft/textures"))) {
    unzip(archive, extractedRoot, [
      "assets/minecraft/items/*",
      "assets/minecraft/lang/*",
      "assets/minecraft/models/*",
      "assets/minecraft/textures/*",
      "data/minecraft/recipe/*",
      "data/minecraft/tags/item/*",
    ]);
  }
  if (!fs.existsSync(path.join(extractedRoot, "data/minecraft/recipe"))) {
    unzip(archive, extractedRoot, ["data/minecraft/recipe/*"]);
  }
  if (!fs.existsSync(path.join(extractedRoot, "data/minecraft/tags/item"))) {
    unzip(archive, extractedRoot, ["data/minecraft/tags/item/*"]);
  }
  return extractedRoot;
}

export function preparePublicAssets(packRoot, vanillaRoot, versionId) {
  const stagingRoot = path.join(cacheRoot, "staging", versionId);
  const stagingPublic = path.join(stagingRoot, "public");
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.mkdirSync(stagingPublic, { recursive: true });

  fs.cpSync(
    path.join(vanillaRoot, "assets"),
    path.join(stagingPublic, "minecraft/assets"),
    { recursive: true, force: true },
  );
  fs.cpSync(
    path.join(packRoot, "assets"),
    path.join(stagingPublic, "minecraft/assets"),
    { recursive: true, force: true },
  );

  const matchaRoot = path.join(stagingPublic, "matcha");
  fs.mkdirSync(matchaRoot, { recursive: true });
  fs.copyFileSync(
    path.join(packRoot, "pack.png"),
    path.join(matchaRoot, "pack.png"),
  );
  const panorama = path.join(
    packRoot,
    "assets/minecraft/textures/gui/title/background/panorama_0.png",
  );
  if (fs.existsSync(panorama)) {
    fs.copyFileSync(panorama, path.join(matchaRoot, "panorama.png"));
  } else {
    fs.copyFileSync(
      path.join(projectRoot, "public/matcha/panorama.png"),
      path.join(matchaRoot, "panorama.png"),
    );
  }
  return { stagingPublic, stagingRoot };
}

export function runGenerator({
  packRoot,
  releaseMetadataFile,
  stagingPublic,
  stagedData,
  vanillaRoot,
}) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(projectRoot, "scripts/build-wiki-data.mjs"),
      packRoot,
      stagedData,
      releaseMetadataFile,
      stagingPublic,
      "",
      vanillaRoot,
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("The wiki data generator failed.");
  }
}

// The wiki publishes every recipe, item, and advancement in full. Spoiler
// handling is a display concern (app/data/spoilers.json), so any record that
// looks redacted means the generator regressed.
export function findWithheldData(data) {
  const redactedRecipe = data.recipes.find(
    (recipe) =>
      "secret" in recipe ||
      "reviewPending" in recipe ||
      (recipe.station !== "chemistry" && recipe.ingredients.length === 0),
  );
  if (redactedRecipe) return `recipe ${redactedRecipe.id}`;
  const redactedItem = data.items.find(
    (item) => "obscured" in item || "sga" in item || !item.name,
  );
  if (redactedItem) return `item ${redactedItem.key}`;
  const redactedFish = (data.fish || []).find((entry) => "obscured" in entry);
  if (redactedFish) return `fish ${redactedFish.itemKey}`;
  return null;
}

export function validateGeneratedData(file, versionId) {
  const data = readJson(file);
  if (
    !data ||
    data.release?.versionId !== versionId ||
    data.recipes.length === 0 ||
    data.items.length === 0 ||
    data.locations.length === 0 ||
    data.items.some((item) => !item.texture)
  ) {
    throw new Error("Generated wiki data failed validation.");
  }
  const itemKeys = new Set(data.items.map((item) => item.key));
  const brokenLocation = data.locations.find(
    (location) =>
      !itemKeys.has(location.markerKey) ||
      location.itemKeys.some((key) => !itemKeys.has(key)),
  );
  if (brokenLocation) {
    throw new Error(
      `Location item link was not generated: ${brokenLocation.id}`,
    );
  }
  const withheld = findWithheldData(data);
  if (withheld) {
    throw new Error(`Generated data withholds content: ${withheld}`);
  }
  return data;
}

function replaceGeneratedDirectory(source, target) {
  const next = `${target}.next`;
  const previous = `${target}.previous`;
  fs.rmSync(next, { recursive: true, force: true });
  fs.rmSync(previous, { recursive: true, force: true });
  fs.cpSync(source, next, { recursive: true, force: true });
  if (fs.existsSync(target)) {
    fs.renameSync(target, previous);
  }
  try {
    fs.renameSync(next, target);
  } catch (error) {
    if (fs.existsSync(previous) && !fs.existsSync(target)) {
      fs.renameSync(previous, target);
    }
    throw error;
  }
  fs.rmSync(previous, { recursive: true, force: true });
}

// Re-derive spoiler flags for the freshly published data. Hand edits in
// app/data/spoilers.json are preserved by the script itself.
export function refreshSpoilers(packRoot) {
  const result = spawnSync(
    process.execPath,
    [path.join(projectRoot, "scripts/build-spoilers.mjs"), packRoot],
    { cwd: projectRoot, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("The spoiler flag generator failed.");
  }
}

export function publishUpdate(stagingPublic, stagedData, releaseMetadata) {
  replaceGeneratedDirectory(
    path.join(stagingPublic, "minecraft"),
    path.join(projectRoot, "public/minecraft"),
  );
  replaceGeneratedDirectory(
    path.join(stagingPublic, "matcha"),
    path.join(projectRoot, "public/matcha"),
  );
  const nextData = `${liveDataFile}.next`;
  fs.copyFileSync(stagedData, nextData);
  fs.renameSync(nextData, liveDataFile);
  writeJsonAtomic(updaterStateFile, {
    release: releaseMetadata,
    updatedAt: new Date().toISOString(),
  });
}

export async function checkForMatchaUpdate({
  force = false,
  checkOnly = false,
  quiet = false,
} = {}) {
  fs.mkdirSync(cacheRoot, { recursive: true });
  const currentData = readJson(liveDataFile);
  const { latest: version, changelog } = await projectVersions();
  const file = primaryFile(version);
  const nextChangelogHash = changelogHash(changelog);
  const changed =
    force ||
    currentData?.release?.sha1 !== file?.hashes?.sha1 ||
    currentData?.release?.changelogHash !== nextChangelogHash;

  if (!quiet) {
    console.log(
      changed
        ? `Matcha Flavoured ${version.version_number} is ready to sync.`
        : `Matcha Flavoured ${version.version_number} is already current.`,
    );
  }
  if (checkOnly) {
    return { changed, updated: false, version };
  }

  const pack = await ensurePack(version);
  if (!changed) {
    writeJsonAtomic(updaterStateFile, {
      release: currentData.release,
      checkedAt: new Date().toISOString(),
    });
    return { changed: false, updated: false, version };
  }

  const { gameVersion, metadata } = await minecraftVersionFor(version);
  const vanillaRoot = await ensureVanillaAssets(gameVersion, metadata);
  const { stagingPublic, stagingRoot } = preparePublicAssets(
    pack.packRoot,
    vanillaRoot,
    version.id,
  );
  const releaseMetadata = {
    version: version.version_number,
    name: version.name,
    minecraft: gameVersion,
    published: formatReleaseDate(version.date_published),
    modrinthUrl: "https://modrinth.com/datapack/matcha-flavoured",
    downloadUrl: pack.file.url,
    sha1: pack.file.hashes.sha1,
    versionId: version.id,
    highlights: releaseHighlights(version.changelog),
    changelog,
    changelogHash: nextChangelogHash,
    checkedAt: new Date().toISOString(),
  };
  const releaseMetadataFile = path.join(stagingRoot, "release.json");
  const stagedData = path.join(stagingRoot, "wiki-data.json");
  writeJsonAtomic(releaseMetadataFile, releaseMetadata);
  runGenerator({
    packRoot: pack.packRoot,
    releaseMetadataFile,
    stagingPublic,
    stagedData,
    vanillaRoot,
  });
  const generated = validateGeneratedData(stagedData, version.id);
  publishUpdate(stagingPublic, stagedData, releaseMetadata);
  refreshSpoilers(pack.packRoot);
  if (!quiet) {
    console.log(
      `Wiki updated to ${version.version_number}: ` +
        `${generated.stats.recipeCount} recipes, ` +
        `${generated.stats.itemCount} items, ` +
        `${generated.stats.advancementCount} advancements (all published in full).`,
    );
  }
  return {
    changed: true,
    updated: true,
    version,
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  checkForMatchaUpdate({
    force: process.argv.includes("--force"),
    checkOnly: process.argv.includes("--check"),
    quiet: process.argv.includes("--quiet"),
  })
    .then((result) => {
      if (process.argv.includes("--check-exit-code") && result.changed) {
        process.exitCode = 10;
      }
    })
    .catch((error) => {
      console.error(`Matcha update failed: ${error.message}`);
      process.exitCode = 1;
    });
}
