// Recipes, pack and vanilla. Every slot keeps its exact position: crafting
// grids stay 3x3, smithing keeps template/base/addition (a missing template
// stays an empty slot).
import { recipeSemanticSha1 } from "../recipe-fingerprint.mjs";
import { normalizeId, readJson, slugify, splitId, titleCase } from "./util.mjs";

const stationBlocks = {
  crafting: "minecraft:crafting_table",
  furnace: "minecraft:furnace",
  blasting: "minecraft:blast_furnace",
  smoking: "minecraft:smoker",
  campfire: "minecraft:campfire",
  smithing: "minecraft:smithing_table",
  stonecutting: "minecraft:stonecutter",
};

export function stationFor(type) {
  const t = String(type || "").replace(/^minecraft:/, "");
  if (t.startsWith("crafting")) return "crafting";
  if (t === "stonecutting") return "stonecutting";
  if (t.startsWith("smithing")) return "smithing";
  if (t === "blasting") return "blasting";
  if (t === "smoking") return "smoking";
  if (t === "campfire_cooking") return "campfire";
  if (t === "smelting") return "furnace";
  return null;
}

const woodFamilies = ["pale_oak", "dark_oak", "acacia", "bamboo", "birch", "cherry", "crimson", "jungle", "mangrove", "spruce", "warped", "oak"];
const materialFamilies = ["copper", "deepslate", "sandstone", "blackstone", "prismarine", "quartz", "granite", "diorite", "andesite", "tuff", "limestone", "hellbrick", "mud", "steel", "iron", "dirt", "cinnabar", "sulfur", "stone", "bronze", "shakudo", "electrum", "adamant", "silver", "gold", "diamond"];

function familyFor(recipePath, station, firstLabel) {
  const folder = recipePath.split("/")[0];
  if (folder === "food") return "Food & drink";
  if (folder === "blessing") return "Blessings";
  const comparable = `${recipePath} ${station === "stonecutting" ? firstLabel : ""}`.toLowerCase().replaceAll("_", " ");
  const wood = woodFamilies.find((family) => comparable.includes(family.replaceAll("_", " ")));
  if (wood) return `${titleCase(wood)} wood`;
  const material = materialFamilies.find((family) => comparable.includes(family));
  if (material) return `${titleCase(material)}`;
  return "Other";
}

export function buildRecipes({ resources, text, items }) {
  const stationLabels = Object.fromEntries(
    Object.entries(stationBlocks).map(([station, block]) => [station, text.nameFor(block) || titleCase(block)]),
  );

  const ingredient = (raw, defaultNamespace = "minecraft") => {
    if (raw === null || raw === undefined) return null;
    let values = [];
    let tag = null;
    if (Array.isArray(raw)) values = raw.flatMap((entry) => (typeof entry === "string" ? [entry] : entry?.item || entry?.id ? [entry.item || entry.id] : entry?.tag ? [`#${entry.tag}`] : []));
    else if (typeof raw === "string") values = [raw];
    else if (raw.tag) values = [`#${raw.tag}`];
    else if (raw.item || raw.id) values = [raw.item || raw.id];
    if (values.length === 1 && values[0].startsWith("#")) tag = normalizeId(values[0].slice(1), defaultNamespace);
    const ids = values.flatMap((value) =>
      value.startsWith("#") ? resources.tag("item", normalizeId(value.slice(1), defaultNamespace)) : [normalizeId(value, defaultNamespace)],
    );
    const keys = [...new Set(ids.map((id) => items.plain(id)))];
    const record = { keys };
    if (tag) record.tag = tag;
    if (!keys.length) record.unresolved = true; // a tag that exists nowhere
    return record;
  };

  const result = (raw) => {
    const id = typeof raw === "string" ? raw : raw?.id || raw?.item;
    if (!id) return null;
    const components = (typeof raw === "object" && raw.components) || {};
    const key = items.define(id, components, "recipe");
    return { key, baseId: normalizeId(id), count: Number(raw?.count) || 1 };
  };

  // Fingerprints of vanilla's own files, including ones the pack overrides or
  // blocks with its pack.mcmeta filter.
  const vanillaLayer = resources.layers.find((layer) => layer.name === "vanilla");
  const vanillaHashes = new Set();
  const vanillaNames = new Set();
  for (const [id, hit] of vanillaLayer ? resources.list("recipe", { layer: vanillaLayer, unfiltered: true }) : []) {
    const json = readJson(hit.file);
    if (json) vanillaHashes.add(recipeSemanticSha1(json));
    vanillaNames.add(splitId(id)[1].split("/").at(-1));
  }

  const recipes = [];
  const excluded = [];
  for (const [id, hit] of resources.list("recipe")) {
    const recipe = readJson(hit.file);
    if (!recipe?.type) continue;
    const station = stationFor(recipe.type);
    if (!station) continue;
    const [namespace, recipePath] = splitId(id);
    let origin = "vanilla";
    if (hit.layer !== "vanilla") {
      // A pack copy identical to a vanilla recipe is not a change.
      if (vanillaHashes.has(recipeSemanticSha1(recipe))) {
        excluded.push(id);
        origin = "vanilla";
      } else {
        origin = vanillaNames.has(recipePath.split("/").at(-1)) ? "changed" : "added";
      }
    }
    const type = String(recipe.type).replace(/^minecraft:/, "");
    let out = null;
    let grid = null;
    let slots = null;
    let input = null;
    if (type === "crafting_shaped") {
      const rows = recipe.pattern || [];
      const width = Math.max(0, ...rows.map((row) => row.length));
      const top = Math.floor((3 - rows.length) / 2);
      const left = Math.floor((3 - width) / 2);
      grid = Array(9).fill(null);
      rows.forEach((row, r) => [...row].forEach((symbol, col) => {
        if (symbol !== " " && recipe.key?.[symbol] !== undefined) grid[(r + top) * 3 + col + left] = ingredient(recipe.key[symbol]);
      }));
      out = result(recipe.result);
    } else if (type === "crafting_shapeless") {
      grid = [...(recipe.ingredients || []).map((entry) => ingredient(entry)), ...Array(9).fill(null)].slice(0, 9);
      out = result(recipe.result);
    } else if (type === "crafting_transmute") {
      grid = [ingredient(recipe.input), ingredient(recipe.material), ...Array(7).fill(null)];
      out = result(recipe.result);
    } else if (type.startsWith("smithing")) {
      if (!recipe.result) continue; // smithing_trim has no fixed result
      slots = [ingredient(recipe.template), ingredient(recipe.base), ingredient(recipe.addition)];
      out = result(recipe.result);
    } else if (["smelting", "blasting", "smoking", "campfire_cooking", "stonecutting"].includes(type)) {
      input = ingredient(recipe.ingredient ?? recipe.input);
      out = result(recipe.result);
    }
    if (!out) continue; // special crafting (map cloning, dyeing...) has no fixed result
    const cells = grid || slots || [input];
    const ingredientKeys = [...new Set(cells.filter(Boolean).flatMap((cell) => cell.keys))];
    const record = {
      id,
      slug: slugify(id),
      kind: type === "crafting_shaped" ? "shaped" : type.startsWith("crafting") ? "shapeless" : station === "furnace" || station === "blasting" || station === "smoking" ? "cooking" : station,
      station,
      stationLabel: stationLabels[station],
      origin,
      folder: recipePath.split("/").length > 1 ? recipePath.split("/")[0] : namespace,
      category: recipe.category || "misc",
      family: familyFor(recipePath, station, ""),
      result: out,
      ingredientKeys,
      ...(grid ? { grid } : {}),
      ...(slots ? { slots } : {}),
      ...(input ? { input } : {}),
      ...(recipe.cookingtime !== undefined || ["smelting", "blasting", "smoking", "campfire_cooking"].includes(type)
        ? { seconds: Number(recipe.cookingtime ?? (type === "smelting" ? 200 : 100)) / 20, xp: Number(recipe.experience || 0) }
        : {}),
    };
    if (recipe.group) record.group = recipe.group;
    recipes.push(record);
  }
  recipes.sort((a, b) => (a.origin === "vanilla") - (b.origin === "vanilla") || a.id.localeCompare(b.id));
  return { recipes, excludedVanillaCopies: excluded, stationLabels };
}
