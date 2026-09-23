// Where pack and vanilla files come from: Modrinth releases, the official
// GitHub repository, and Minecraft itself (Mojang client jar or misode/mcmeta).
// Every source resolves to { dataRoot, assetsRoot } folders on disk.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { cacheRoot, formatDate, readJson, sha1File } from "./util.mjs";
import { extractZip } from "./zip.mjs";

const modrinthApi = "https://api.modrinth.com/v2";
const projectSlug = "matcha-flavoured";
const mojangManifestUrl =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
export const officialRepoUrl = "https://github.com/kleiwright/matcha-flavoured";
const mcmetaUrl = "https://github.com/misode/mcmeta.git";
const userAgent = "matcha-flavoured-field-wiki/0.2.0 (github.com/filmsofilm93/MatchaFlavouredWiki)";

export async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": userAgent },
  });
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${url}`);
  return response.json();
}

async function downloadFile(url, destination) {
  const response = await fetch(url, { headers: { "User-Agent": userAgent } });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.part`;
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary));
  fs.renameSync(temporary, destination);
}

async function ensureDownload(url, destination, expectedSha1) {
  if (!fs.existsSync(destination) || sha1File(destination) !== expectedSha1) {
    await downloadFile(url, destination);
  }
  if (sha1File(destination) !== expectedSha1) {
    throw new Error(`${path.basename(destination)} failed its SHA-1 check.`);
  }
}

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, stdio: "pipe", encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

// Find the folder inside an extracted archive that holds `child` (data/ or
// assets/): either the archive root or one level down.
function findChildRoot(extractedRoot, child) {
  if (fs.existsSync(path.join(extractedRoot, child))) return extractedRoot;
  for (const entry of fs.readdirSync(extractedRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && fs.existsSync(path.join(extractedRoot, entry.name, child))) {
      return path.join(extractedRoot, entry.name);
    }
  }
  return null;
}

// ---------------------------------------------------------------- Modrinth

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
        return { type: "heading", text: cleanChangelogText(line.replace(/^#{1,6}\s+/, "")) };
      }
      if (/^([-*+]|\d+[.)])\s+/.test(line)) {
        return { type: "bullet", text: cleanChangelogText(line.replace(/^([-*+]|\d+[.)])\s+/, "")) };
      }
      return { type: "paragraph", text: cleanChangelogText(line) };
    })
    .filter((block) => block?.text);
}

// Since 1.12.2 a release is uploaded as two Modrinth versions sharing one
// version number: the data pack (loader "datapack") and the resource pack
// (loader "minecraft", named "See DP ..."). Group them back into releases.
export async function modrinthReleases() {
  const versions = await fetchJson(
    `${modrinthApi}/project/${projectSlug}/version?include_changelog=true`,
  );
  const groups = new Map();
  for (const version of versions.filter((entry) => entry.status === "listed")) {
    const list = groups.get(version.version_number) || [];
    list.push(version);
    groups.set(version.version_number, list);
  }
  const releases = [...groups.entries()].map(([versionNumber, list]) => {
    const pointer = (entry) => /^see dp\b/i.test(entry.name) || /^see dp/i.test(entry.changelog || "");
    const main = list.find((entry) => entry.loaders.includes("datapack") && !pointer(entry)) ||
      list.find((entry) => !pointer(entry)) || list[0];
    const newest = list.reduce((a, b) => (new Date(a.date_published) > new Date(b.date_published) ? a : b));
    return {
      version: versionNumber,
      name: main.name,
      channel: main.version_type,
      publishedAt: newest.date_published,
      published: formatDate(newest.date_published),
      minecraft: [...new Set(list.flatMap((entry) => entry.game_versions || []))],
      versionIds: list.map((entry) => entry.id),
      featured: list.some((entry) => entry.featured),
      changelogText: main.changelog || "",
      files: list.map((entry) => {
        const file = entry.files.find((candidate) => candidate.primary) || entry.files[0];
        return {
          url: file.url,
          filename: file.filename,
          sha1: file.hashes.sha1,
          size: file.size,
          loaders: entry.loaders,
          versionId: entry.id,
        };
      }),
    };
  });
  releases.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  if (!releases.length) throw new Error("Modrinth returned no listed releases.");
  return releases;
}

export function releaseChangelog(releases) {
  return releases.map((release) => ({
    version: release.version,
    name: release.name,
    published: release.published,
    minecraft: release.minecraft,
    channel: release.channel,
    featured: release.featured,
    blocks: changelogBlocks(release.changelogText),
  }));
}

export async function ensureModrinthPack(release) {
  const releaseRoot = path.join(cacheRoot, "releases", release.version);
  let dataRoot = null;
  let assetsRoot = null;
  let metaRoot = null;
  for (const file of release.files) {
    const archive = path.join(releaseRoot, file.filename);
    await ensureDownload(file.url, archive, file.sha1);
    const extracted = path.join(releaseRoot, `unpacked-${file.sha1.slice(0, 12)}`);
    if (!fs.existsSync(path.join(extracted, ".done"))) {
      fs.rmSync(extracted, { recursive: true, force: true });
      extractZip(archive, extracted);
      fs.writeFileSync(path.join(extracted, ".done"), "");
    }
    const data = findChildRoot(extracted, "data");
    const assets = findChildRoot(extracted, "assets");
    if (data) dataRoot ||= path.join(data, "data");
    if (assets) assetsRoot ||= path.join(assets, "assets");
    if (data || !metaRoot) metaRoot = data || assets || metaRoot;
  }
  if (!dataRoot) throw new Error(`Release ${release.version} has no data pack.`);
  if (!assetsRoot) throw new Error(`Release ${release.version} has no resource pack.`);
  return { dataRoot, assetsRoot, metaRoot };
}

// ---------------------------------------------------------------- GitHub

export function ensureGithubPack(ref = "") {
  const repoRoot = path.join(cacheRoot, "github", "matcha-flavoured");
  if (!fs.existsSync(path.join(repoRoot, ".git"))) {
    fs.mkdirSync(path.dirname(repoRoot), { recursive: true });
    git(["clone", "--quiet", "--filter=blob:none", `${officialRepoUrl}.git`, repoRoot]);
  } else {
    git(["fetch", "--quiet", "--tags", "--prune", "origin"], repoRoot);
  }
  const head = git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], repoRoot);
  git(["checkout", "--quiet", "--detach", ref || head], repoRoot);
  const commit = git(["rev-parse", "HEAD"], repoRoot);
  const committedAt = git(["show", "-s", "--format=%cI", "HEAD"], repoRoot);
  // Two layouts: Matcha_Flavoured/ (data + assets, up to 1.12.1) and
  // MF_datapack/ + MF_resourcepack/ after that.
  const legacy = path.join(repoRoot, "Matcha_Flavoured");
  const split = [path.join(repoRoot, "MF_datapack"), path.join(repoRoot, "MF_resourcepack")];
  let pack;
  if (fs.existsSync(path.join(legacy, "data"))) {
    pack = { dataRoot: path.join(legacy, "data"), assetsRoot: path.join(legacy, "assets"), metaRoot: legacy };
  } else if (fs.existsSync(path.join(split[0], "data"))) {
    pack = { dataRoot: path.join(split[0], "data"), assetsRoot: path.join(split[1], "assets"), metaRoot: split[0] };
  } else {
    throw new Error("The official repository has no recognised pack layout.");
  }
  const changelogFile = [path.join(repoRoot, "changelog.md"), path.join(pack.metaRoot, "changelog.md")]
    .find((file) => fs.existsSync(file));
  return {
    ...pack,
    commit,
    committedAt,
    branch: head.replace(/^origin\//, ""),
    repositoryChangelog: changelogFile ? changelogBlocks(fs.readFileSync(changelogFile, "utf8")) : [],
  };
}

export function packDescription(metaRoot) {
  const meta = readJson(path.join(metaRoot, "pack.mcmeta"));
  const description = meta?.pack?.description;
  const text = Array.isArray(description)
    ? description.map((part) => (typeof part === "string" ? part : part?.text || "")).join("")
    : String(description?.text ?? description ?? "");
  const match = text.match(/([\w.-]+)\s+for\s+([\w.-]+)/);
  return { version: match?.[1] || "dev", minecraft: match?.[2] || "" };
}

// ---------------------------------------------------------------- vanilla

// Only what the pipeline reads: item/model/texture assets, English names and
// the whole data folder (recipes, tags, loot, worldgen, structures, trades).
const vanillaKeep = (name) =>
  name.startsWith("data/minecraft/") ||
  name === "assets/minecraft/lang/en_us.json" ||
  /^assets\/minecraft\/(items|models|textures|blockstates)\//.test(name);

export async function ensureVanilla(gameVersion, { source = "mojang" } = {}) {
  if (source === "mcmeta") return ensureMcmeta(gameVersion);
  const root = path.join(cacheRoot, "minecraft", gameVersion, "root");
  if (!fs.existsSync(path.join(root, ".done"))) {
    const manifest = await fetchJson(mojangManifestUrl);
    const entry = manifest.versions.find((candidate) => candidate.id === gameVersion);
    if (!entry) throw new Error(`Minecraft ${gameVersion} is not in Mojang's manifest.`);
    const metadata = await fetchJson(entry.url);
    const client = metadata.downloads?.client;
    const archive = path.join(cacheRoot, "minecraft", gameVersion, "client.jar");
    await ensureDownload(client.url, archive, client.sha1);
    fs.rmSync(root, { recursive: true, force: true });
    extractZip(archive, root, vanillaKeep);
    fs.writeFileSync(path.join(root, ".done"), "");
  }
  return { dataRoot: path.join(root, "data"), assetsRoot: path.join(root, "assets") };
}

function ensureMcmeta(gameVersion) {
  const root = path.join(cacheRoot, "minecraft", `mcmeta-${gameVersion}`);
  for (const [tag, name, sparse] of [
    [`${gameVersion}-data`, "data", ["data/minecraft"]],
    [`${gameVersion}-assets`, "assets", ["assets/minecraft/items", "assets/minecraft/lang", "assets/minecraft/models", "assets/minecraft/textures", "assets/minecraft/blockstates"]],
  ]) {
    const checkout = path.join(root, name);
    if (sparse.every((entry) => fs.existsSync(path.join(checkout, entry)))) continue;
    fs.rmSync(checkout, { recursive: true, force: true });
    git(["clone", "--quiet", "--depth", "1", "--branch", tag, "--filter=blob:none", "--sparse", mcmetaUrl, checkout]);
    git(["sparse-checkout", "set", ...sparse], checkout);
  }
  return { dataRoot: path.join(root, "data", "data"), assetsRoot: path.join(root, "assets", "assets") };
}
