// Independent spot checks of the published data against the raw pack files.
// It deliberately re-reads the pack with its own small parser instead of the
// pipeline's code, so a pipeline bug cannot hide itself.
//
//   node scripts/audit-pipeline.mjs [--version=<id from versions.json>] [--sample=40]
import fs from "node:fs";
import path from "node:path";
import { ensureGithubPack, ensureModrinthPack, modrinthReleases } from "./pipeline/sources.mjs";
import { arg, projectRoot, stripBom } from "./pipeline/util.mjs";

const index = JSON.parse(fs.readFileSync(path.join(projectRoot, "public/data/versions.json"), "utf8"));
const entry = index.versions.find((version) => version.id === arg("version", index.default));
const data = JSON.parse(fs.readFileSync(path.join(projectRoot, "public", entry.file), "utf8"));
const pack = entry.kind === "github"
  ? ensureGithubPack(entry.commit)
  : await ensureModrinthPack((await modrinthReleases()).find((release) => release.version === entry.version));
const sample = Number(arg("sample", "40"));

const raw = (type, id) => {
  const [namespace, resource] = id.split(":");
  const file = path.join(pack.dataRoot, namespace, type, `${resource}.json`);
  return fs.existsSync(file) ? JSON.parse(stripBom(fs.readFileSync(file, "utf8"))) : null;
};
const ns = (value) => (value.includes(":") ? value : `minecraft:${value}`);
// Deterministic sample spread over the whole list.
const pick = (list) => list.filter((_, i) => i % Math.max(1, Math.floor(list.length / sample)) === 0).slice(0, sample);

const problems = [];
let checked = 0;

// ---------------------------------------------------------------- recipes
const itemKey = (stack) => ns(stack?.components?.["minecraft:item_model"] || stack?.id || stack?.item || stack || "");
const cellKeys = (value) => {
  const values = Array.isArray(value) ? value : [value];
  return values.map((v) => (typeof v === "string" ? v : v?.item || v?.id || (v?.tag ? `#${v.tag}` : ""))).filter(Boolean).map((v) => (v.startsWith("#") ? `#${ns(v.slice(1))}` : ns(v)));
};
for (const recipe of pick(data.recipes.filter((r) => r.origin !== "vanilla"))) {
  const json = raw("recipe", recipe.id);
  if (!json) {
    problems.push(`recipe ${recipe.id}: raw file not found`);
    continue;
  }
  checked += 1;
  const wantCount = Number(json.result?.count || 1);
  const modelOrId = itemKey(json.result);
  if (recipe.result.count !== wantCount) problems.push(`recipe ${recipe.id}: count ${recipe.result.count} != ${wantCount}`);
  if (recipe.result.baseId !== ns(json.result.id || json.result.item || json.result)) problems.push(`recipe ${recipe.id}: base item ${recipe.result.baseId}`);
  if (json.result?.components?.["minecraft:item_model"] && recipe.result.key !== modelOrId) problems.push(`recipe ${recipe.id}: key ${recipe.result.key} != ${modelOrId}`);
  const expected = [];
  if (json.type.endsWith("crafting_shaped")) {
    const rows = json.pattern;
    const width = Math.max(...rows.map((row) => row.length));
    const top = Math.floor((3 - rows.length) / 2);
    const left = Math.floor((3 - width) / 2);
    const grid = Array(9).fill(null);
    rows.forEach((row, r) => [...row].forEach((symbol, c) => { if (symbol !== " ") grid[(r + top) * 3 + c + left] = cellKeys(json.key[symbol]); }));
    expected.push(...grid);
  } else if (json.type.endsWith("crafting_shapeless")) {
    expected.push(...json.ingredients.map(cellKeys), ...Array(9 - json.ingredients.length).fill(null));
  } else if (json.type.includes("smithing")) {
    expected.push(...[json.template, json.base, json.addition].map((v) => (v === undefined ? null : cellKeys(v))));
  } else expected.push(cellKeys(json.ingredient));
  const actual = recipe.grid || recipe.slots || [recipe.input];
  expected.forEach((want, i) => {
    const got = actual[i];
    if (!want) {
      if (got) problems.push(`recipe ${recipe.id}: slot ${i} should be empty`);
      return;
    }
    if (!got) return problems.push(`recipe ${recipe.id}: slot ${i} missing`);
    for (const value of want) {
      if (value.startsWith("#") ? got.tag !== value.slice(1) && !got.keys.length : !got.keys.includes(value)) {
        problems.push(`recipe ${recipe.id}: slot ${i} lacks ${value}`);
      }
    }
  });
  if (json.cookingtime !== undefined && recipe.seconds * 20 !== json.cookingtime) problems.push(`recipe ${recipe.id}: cook time`);
}

// ---------------------------------------------------------------- advancements
const vanillaLang = path.join(projectRoot, ".matcha-cache", "minecraft", entry.minecraft, "root", "assets", "minecraft", "lang", "en_us.json");
const lang = {
  ...(fs.existsSync(vanillaLang) ? JSON.parse(fs.readFileSync(vanillaLang, "utf8")) : {}),
  ...JSON.parse(fs.readFileSync(path.join(pack.assetsRoot, "minecraft/lang/en_us.json"), "utf8")),
};
for (const adv of pick(data.advancements)) {
  const json = raw("advancement", adv.id);
  if (!json) {
    problems.push(`advancement ${adv.id}: raw file not found`);
    continue;
  }
  checked += 1;
  const title = json.display.title;
  // A translation missing here (e.g. no cached vanilla language file in CI)
  // cannot be checked, so it is skipped rather than reported.
  const text = typeof title === "string" ? title : title.text ?? lang[title.translate];
  if (text && adv.title !== text.replace(/§./g, "")) problems.push(`advancement ${adv.id}: title "${adv.title}" != "${text}"`);
  if (adv.frame !== (json.display.frame || "task")) problems.push(`advancement ${adv.id}: frame`);
  if (adv.hidden !== (json.display.hidden === true)) problems.push(`advancement ${adv.id}: hidden`);
  if ((adv.parent || null) !== (json.parent ? ns(json.parent) : null)) problems.push(`advancement ${adv.id}: parent`);
}

// ---------------------------------------------------------------- loot
for (const table of pick(data.loot.filter((t) => t.origin === "pack"))) {
  const json = raw("loot_table", table.id);
  if (!json) continue;
  checked += 1;
  // Every direct item entry must show up among the drops (by base item or model).
  const direct = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (node.type === "minecraft:item" && typeof node.name === "string") {
      const model = (node.functions || []).find((fn) => fn.function?.endsWith("set_components"))?.components?.["minecraft:item_model"];
      direct.push(ns(model || node.name));
    }
    Object.values(node).forEach(visit);
  };
  visit(json.pools);
  const keys = new Set(table.drops.map((drop) => drop.key));
  for (const key of direct) if (!keys.has(key)) problems.push(`loot ${table.id}: ${key} missing from drops`);
  // Pool weights must match the file.
  json.pools?.forEach((pool, i) => {
    const weights = (pool.entries || []).map((e) => Number(e.weight ?? 1));
    const got = table.pools[i]?.entries.map((e) => e.weight) || [];
    if (JSON.stringify(weights) !== JSON.stringify(got)) problems.push(`loot ${table.id}: pool ${i} weights ${got} != ${weights}`);
  });
}

console.log(`Audited ${entry.label}: ${checked} records checked against the raw pack.`);
if (problems.length) {
  console.log(`${problems.length} problem(s):\n  ${problems.slice(0, 40).join("\n  ")}`);
  process.exitCode = 1;
} else {
  console.log("No differences.");
}
