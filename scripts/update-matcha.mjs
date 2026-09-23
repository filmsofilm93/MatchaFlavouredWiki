// Build the wiki's data for every published version:
//   - the latest Modrinth release (the site's default), and
//   - GitHub main of the official repository ("unreleased").
//
//   node scripts/update-matcha.mjs [--only=release|github] [--ref=<git ref>]
//        [--vanilla=mojang|mcmeta] [--allow-drop] [--check [--check-exit-code]]
//
// Output: public/data/versions.json, public/data/<version>.json and the
// textures they use under public/tex/ (nothing else from Minecraft).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildVersion, checkForDrops, danglingReferences, SCHEMA, writeVersion } from "./pipeline/build.mjs";
import {
  ensureGithubPack, ensureModrinthPack, ensureVanilla, modrinthReleases, officialRepoUrl,
  packDescription, releaseChangelog,
} from "./pipeline/sources.mjs";
import { arg, formatDate, projectRoot, readJson, sha1, walk, writeJsonAtomic } from "./pipeline/util.mjs";

const publicRoot = path.join(projectRoot, "public");
const dataDir = path.join(publicRoot, "data");
const texDir = path.join(publicRoot, "tex");
const indexFile = path.join(dataDir, "versions.json");

// The wiki publishes everything in full; spoilers are a display concern
// (app/data/spoilers.json). A record that looks redacted is a regression.
export function findWithheldData(data) {
  const recipe = data.recipes.find((entry) => "secret" in entry || "reviewPending" in entry || !entry.ingredientKeys.length);
  if (recipe) return `recipe ${recipe.id}`;
  const item = data.items.find((entry) => "obscured" in entry || "sga" in entry || !entry.name);
  if (item) return `item ${item.key}`;
  const fish = (data.fish || []).find((entry) => "obscured" in entry);
  if (fish) return `fish ${fish.key}`;
  return null;
}

function remoteHead() {
  const result = spawnSync("git", ["ls-remote", `${officialRepoUrl}.git`, "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.split(/\s/)[0] : null;
}

function slugFor(kind, version) {
  return kind === "github" ? "github-main" : `release-${version}`.replace(/[^a-z0-9.-]/gi, "_");
}

// pack.png sits outside assets/; store it content-addressed like textures.
function packIcon(pack) {
  const file = path.join(pack.metaRoot, "pack.png");
  if (!fs.existsSync(file)) return null;
  const bytes = fs.readFileSync(file);
  const name = `${sha1(bytes).slice(0, 16)}.png`;
  fs.mkdirSync(texDir, { recursive: true });
  if (!fs.existsSync(path.join(texDir, name))) fs.writeFileSync(path.join(texDir, name), bytes);
  return `tex/${name}`;
}

async function buildOne(kind, { releases, vanillaSource }) {
  let pack;
  let release;
  if (kind === "release") {
    const latest = releases[0];
    pack = await ensureModrinthPack(latest);
    release = {
      kind,
      version: latest.version,
      name: latest.name,
      channel: latest.channel,
      minecraft: latest.minecraft[0] || packDescription(pack.metaRoot).minecraft,
      published: latest.published,
      modrinthUrl: "https://modrinth.com/datapack/matcha-flavoured",
      downloadUrl: `https://modrinth.com/datapack/matcha-flavoured/version/${latest.versionIds[0]}`,
      files: latest.files.map((file) => ({ filename: file.filename, sha1: file.sha1, loaders: file.loaders })),
    };
  } else {
    pack = ensureGithubPack(arg("ref"));
    const described = packDescription(pack.metaRoot);
    release = {
      kind,
      version: described.version,
      name: `GitHub ${pack.branch} (unreleased)`,
      channel: "unreleased",
      minecraft: described.minecraft || releases[0]?.minecraft[0] || "26.2",
      published: formatDate(pack.committedAt),
      commit: pack.commit,
      repositoryUrl: officialRepoUrl,
      repositoryChangelog: pack.repositoryChangelog,
    };
  }
  const vanilla = await ensureVanilla(release.minecraft, { source: vanillaSource });
  release.icon = packIcon(pack);
  release.builtAt = new Date().toISOString();
  const data = buildVersion({ pack, vanilla, release, texDir });
  return data;
}

function pruneTextures(dataFiles) {
  const used = new Set();
  for (const file of dataFiles) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/tex\/([0-9a-f]{16}\.png)/g)) used.add(match[1]);
  }
  let removed = 0;
  for (const file of walk(texDir)) {
    if (!used.has(path.basename(file))) {
      fs.rmSync(file);
      removed += 1;
    }
  }
  return removed;
}

export async function update() {
  const only = arg("only");
  const kinds = only ? [only] : ["release", "github"];
  const index = readJson(indexFile) || { versions: [] };
  const releases = await modrinthReleases();

  if (process.argv.includes("--check")) {
    const latest = releases[0];
    const current = index.versions.find((entry) => entry.kind === "release");
    const releaseChanged = !current || current.version !== latest.version ||
      JSON.stringify(current.files?.map((file) => file.sha1)) !== JSON.stringify(latest.files.map((file) => file.sha1));
    const head = remoteHead();
    const github = index.versions.find((entry) => entry.kind === "github");
    const githubChanged = Boolean(head) && github?.commit !== head;
    console.log(`Latest release ${latest.version}: ${releaseChanged ? "needs a build" : "current"}. GitHub main ${head?.slice(0, 7) || "?"}: ${githubChanged ? "needs a build" : "current"}.`);
    return { changed: releaseChanged || githubChanged };
  }

  const vanillaSource = arg("vanilla", "mojang");
  const built = [];
  for (const kind of kinds) {
    console.log(`Building ${kind}…`);
    const data = await buildOne(kind, { releases, vanillaSource });
    const slug = slugFor(kind, data.release.version);
    if (process.argv.includes("--dry-run")) {
      const out = path.resolve(arg("out", path.join(projectRoot, ".matcha-cache", "dry-run", `${slug}.json`)));
      writeVersion(out, data);
      console.log(`Dry run: wrote ${out}`);
      continue;
    }
    const file = path.join(dataDir, `${slug}.json`);
    const previousEntry = index.versions.find((entry) => entry.kind === kind);
    const previous = previousEntry ? readJson(path.join(dataDir, previousEntry.file.replace(/^data\//, ""))) : null;
    const problems = [
      ...checkForDrops(data, previous),
      ...danglingReferences(data).slice(0, 5).map((problem) => `dangling reference: ${problem}`),
    ];
    const withheld = findWithheldData(data);
    if (withheld) problems.push(`withheld data: ${withheld}`);
    if (problems.length) {
      const message = `${kind} ${data.release.version} failed its checks:\n  - ${problems.join("\n  - ")}`;
      if (!process.argv.includes("--allow-drop")) throw new Error(`${message}\nRe-run with --allow-drop if the pack really changed.`);
      console.warn(`${message}\n(--allow-drop: publishing anyway)`);
    }
    writeVersion(file, data);
    built.push({ kind, slug, data });
    const s = data.stats;
    console.log(`  ${data.release.version}: ${s.packRecipes} pack recipes (+${s.recipes - s.packRecipes} vanilla), ${s.items} items, ${s.advancements} advancements, ${s.lootTables} loot tables, ${s.trades} trades, ${s.fish} fish, ${s.ores} ore features, ${s.structures} structures.`);
  }

  if (process.argv.includes("--dry-run")) return { changed: false };
  const versions = [...index.versions.filter((entry) => !built.some((b) => b.kind === entry.kind))];
  for (const { kind, slug, data } of built) {
    versions.push({
      id: slug,
      kind,
      file: `data/${slug}.json`,
      version: data.release.version,
      label: kind === "github" ? `GitHub main (unreleased, ${data.release.commit.slice(0, 7)})` : `${data.release.version}`,
      name: data.release.name,
      minecraft: data.release.minecraft,
      published: data.release.published,
      ...(data.release.commit ? { commit: data.release.commit } : {}),
      ...(data.release.files ? { files: data.release.files } : {}),
      icon: data.release.icon,
    });
  }
  versions.sort((a, b) => (a.kind === "release" ? 0 : 1) - (b.kind === "release" ? 0 : 1));
  const nextIndex = {
    schema: SCHEMA,
    default: versions.find((entry) => entry.kind === "release")?.id || versions[0]?.id,
    versions,
    changelog: releaseChangelog(releases),
    updatedAt: new Date().toISOString(),
  };
  writeJsonAtomic(indexFile, nextIndex);
  const removed = pruneTextures(versions.map((entry) => path.join(publicRoot, entry.file)));
  console.log(`Published ${versions.length} version(s); removed ${removed} unused texture(s).`);

  const spoilers = spawnSync(process.execPath, [path.join(projectRoot, "scripts/build-spoilers.mjs")], { cwd: projectRoot, stdio: "inherit" });
  if (spoilers.status !== 0) throw new Error("The spoiler flag generator failed.");
  return { changed: true };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  update()
    .then((result) => {
      if (process.argv.includes("--check-exit-code") && result.changed) process.exitCode = 10;
    })
    .catch((error) => {
      console.error(`Matcha update failed: ${error.message}`);
      process.exitCode = 1;
    });
}
