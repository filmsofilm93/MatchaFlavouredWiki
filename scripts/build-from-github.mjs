// Build the wiki data straight from the official GitHub repository
// (https://github.com/kleiwright/matcha-flavoured) instead of a Modrinth
// release archive. Useful when Modrinth is unreachable, for auditing, and for
// previewing unreleased changes on `main`.
//
//   node scripts/build-from-github.mjs [--ref=<commit|branch|tag>]
//        [--vanilla-dir=<dir with assets/ and data/minecraft/recipe>]
//        [--vanilla=mojang|mcmeta] [--minecraft=<version>] [--out=<file>]
//        [--dry-run]
//
// --dry-run writes the generated JSON to --out (default: .matcha-cache) and
// leaves app/data and public untouched.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  changelogBlocks,
  ensureVanillaAssets,
  minecraftVersionFor,
  preparePublicAssets,
  publishUpdate,
  readJson,
  refreshSpoilers,
  runGenerator,
  validateGeneratedData,
  writeJsonAtomic,
} from "./update-matcha.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const cacheRoot = path.join(projectRoot, ".matcha-cache");
const repoUrl = "https://github.com/kleiwright/matcha-flavoured.git";
const mcmetaUrl = "https://github.com/misode/mcmeta.git";

function arg(name, fallback = "") {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function git(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function ensureRepo(ref) {
  const repoRoot = path.join(cacheRoot, "github", "matcha-flavoured");
  if (!fs.existsSync(path.join(repoRoot, ".git"))) {
    fs.mkdirSync(path.dirname(repoRoot), { recursive: true });
    git(["clone", "--quiet", "--filter=blob:none", repoUrl, repoRoot]);
  } else {
    git(["fetch", "--quiet", "--tags", "origin"], repoRoot);
  }
  const target = ref || "origin/HEAD";
  git(["checkout", "--quiet", "--detach", target], repoRoot);
  return {
    repoRoot,
    commit: git(["rev-parse", "HEAD"], repoRoot),
    committedAt: git(["show", "-s", "--format=%cI", "HEAD"], repoRoot),
  };
}

// The repository has used two layouts: a combined pack in Matcha_Flavoured/
// (up to 1.12.1) and split MF_datapack/ + MF_resourcepack/ folders after that.
function assemblePackRoot(repoRoot, commit) {
  const legacy = path.join(repoRoot, "Matcha_Flavoured");
  if (fs.existsSync(path.join(legacy, "data"))) return legacy;
  const datapack = path.join(repoRoot, "MF_datapack");
  const resourcepack = path.join(repoRoot, "MF_resourcepack");
  if (!fs.existsSync(path.join(datapack, "data"))) {
    throw new Error("The official repository has no recognised pack layout.");
  }
  const packRoot = path.join(
    cacheRoot,
    "github",
    `pack-${commit.slice(0, 12)}`,
  );
  if (!fs.existsSync(path.join(packRoot, "data"))) {
    fs.rmSync(packRoot, { recursive: true, force: true });
    fs.mkdirSync(packRoot, { recursive: true });
    fs.cpSync(path.join(datapack, "data"), path.join(packRoot, "data"), {
      recursive: true,
    });
    fs.cpSync(
      path.join(resourcepack, "assets"),
      path.join(packRoot, "assets"),
      { recursive: true },
    );
    for (const file of ["pack.png", "pack.mcmeta", "CREDITS.txt"]) {
      const source = path.join(datapack, file);
      if (fs.existsSync(source)) {
        fs.copyFileSync(source, path.join(packRoot, file));
      }
    }
  }
  return packRoot;
}

function packDescription(packRoot) {
  const meta = readJson(path.join(packRoot, "pack.mcmeta"));
  const description = meta?.pack?.description;
  const text = Array.isArray(description)
    ? description.map((part) => part?.text || "").join("")
    : String(description?.text || description || "");
  const match = text.match(/([\w.-]+)\s+for\s+([\w.-]+)/);
  return {
    version: match?.[1] || "dev",
    minecraft: match?.[2] || "",
  };
}

function ensureMcmeta(gameVersion) {
  const root = path.join(cacheRoot, "minecraft", `mcmeta-${gameVersion}`);
  const pieces = [
    [
      `${gameVersion}-data`,
      "data",
      ["data/minecraft/recipe", "data/minecraft/tags/item"],
    ],
    [
      `${gameVersion}-assets`,
      "assets",
      [
        "assets/minecraft/items",
        "assets/minecraft/lang",
        "assets/minecraft/models",
        "assets/minecraft/textures",
      ],
    ],
  ];
  for (const [tag, name, sparse] of pieces) {
    const checkout = path.join(root, name);
    if (sparse.every((entry) => fs.existsSync(path.join(checkout, entry)))) {
      continue;
    }
    fs.rmSync(checkout, { recursive: true, force: true });
    git([
      "clone",
      "--quiet",
      "--depth",
      "1",
      "--branch",
      tag,
      "--filter=blob:none",
      "--sparse",
      mcmetaUrl,
      checkout,
    ]);
    git(["sparse-checkout", "set", ...sparse], checkout);
  }
  const merged = path.join(root, "merged");
  if (!fs.existsSync(path.join(merged, "data/minecraft/tags/item"))) {
    fs.rmSync(merged, { recursive: true, force: true });
    fs.mkdirSync(merged, { recursive: true });
    fs.cpSync(path.join(root, "data/data"), path.join(merged, "data"), {
      recursive: true,
    });
    fs.cpSync(path.join(root, "assets/assets"), path.join(merged, "assets"), {
      recursive: true,
    });
  }
  return merged;
}

async function vanillaRootFor(gameVersion) {
  const explicit = arg("vanilla-dir");
  if (explicit) return path.resolve(explicit);
  if (arg("vanilla", "mojang") === "mcmeta") return ensureMcmeta(gameVersion);
  const { gameVersion: resolved, metadata } = await minecraftVersionFor({
    game_versions: [gameVersion],
  });
  return ensureVanillaAssets(resolved, metadata);
}

async function main() {
  const { repoRoot, commit, committedAt } = ensureRepo(arg("ref"));
  const packRoot = assemblePackRoot(repoRoot, commit);
  const described = packDescription(packRoot);
  const gameVersion = arg("minecraft") || described.minecraft || "26.2";
  const vanillaRoot = await vanillaRootFor(gameVersion);
  const versionId = `github-${commit.slice(0, 12)}`;
  const current = readJson(path.join(projectRoot, "app/data/wiki-data.json"));
  const changelogFile = [
    path.join(repoRoot, "changelog.md"),
    path.join(packRoot, "changelog.md"),
  ].find((file) => fs.existsSync(file));

  const releaseMetadata = {
    version: described.version,
    name: `GitHub ${commit.slice(0, 7)}`,
    minecraft: gameVersion,
    published: new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(committedAt)),
    modrinthUrl: "https://modrinth.com/datapack/matcha-flavoured",
    downloadUrl: "https://modrinth.com/datapack/matcha-flavoured/versions",
    sha1: commit,
    versionId,
    source: { kind: "github", repository: repoUrl, commit, committedAt },
    highlights: [],
    changelog: current?.release?.changelog || [],
    repositoryChangelog: changelogFile
      ? changelogBlocks(fs.readFileSync(changelogFile, "utf8"))
      : [],
    checkedAt: new Date().toISOString(),
  };

  const { stagingPublic, stagingRoot } = preparePublicAssets(
    packRoot,
    vanillaRoot,
    versionId,
  );
  const releaseMetadataFile = path.join(stagingRoot, "release.json");
  const stagedData = path.join(stagingRoot, "wiki-data.json");
  writeJsonAtomic(releaseMetadataFile, releaseMetadata);
  runGenerator({
    packRoot,
    releaseMetadataFile,
    stagingPublic,
    stagedData,
    vanillaRoot,
  });
  const generated = validateGeneratedData(stagedData, versionId);

  if (process.argv.includes("--dry-run")) {
    const out = path.resolve(
      arg("out", path.join(cacheRoot, `wiki-data-${versionId}.json`)),
    );
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(stagedData, out);
    console.log(`Dry run: wrote ${out}`);
  } else {
    publishUpdate(stagingPublic, stagedData, releaseMetadata);
    refreshSpoilers(packRoot);
  }
  console.log(
    `GitHub ${commit.slice(0, 7)} (${described.version}): ` +
      `${generated.stats.recipeCount} recipes, ${generated.stats.itemCount} items, ` +
      `${generated.stats.advancementCount} advancements.`,
  );
}

main().catch((error) => {
  console.error(`GitHub build failed: ${error.message}`);
  process.exitCode = 1;
});
