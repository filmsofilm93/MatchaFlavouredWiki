// Generate app/data/spoilers.json: a spoiler / not-spoiler flag, a short
// reason, and a spoiler-free hint for every item, recipe, advancement, loot
// table, structure and mechanic of every published version. The flags only
// drive what the site DISPLAYS; the data files always contain everything.
//
//   node scripts/build-spoilers.mjs
//
// Manual edits survive regeneration: an entry with "manual": true, or whose
// spoiler/reason/hint no longer match the signature written at generation
// time, is kept exactly as it is. Entries for IDs that disappear move to
// "orphans" when they were edited by hand.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectRoot, readJson, titleCase } from "./pipeline/util.mjs";

const indexFile = path.join(projectRoot, "public/data/versions.json");
const spoilerFile = path.join(projectRoot, "app/data/spoilers.json");

const lateFamilies = [
  [/adamant/, "Adamant (late-game alloy)"],
  [/netherite/, "Netherite (late game)"],
  [/elytra/, "Elytra (End)"],
  [/electrum/, "Electrum (needs a Divine Fragment)"],
  [/dragon|shulker|chorus|purpur|end_crystal|end_rod|end_stone/, "End material"],
];
const treasurePath = /^(treasure|kleis_items|music_disc)\//;
const lateTab = /^(hell|nether|end)\//;
const lateMarkers = /(^|\/)(enter_nether|find_stronghold|enter_end|kill_dragon)$/;
const mechanicRules = [
  [/eerie|village_(entity|jukebox|hopper)|kill_village/, "Lore / horror (village atmosphere)"],
  [/first_dragon|wither/, "Boss / late-game event"],
  [/amnestic|clay_statue|cheerful|mournful/, "Scripted item effect (discovery)"],
  [/application/, "Scripted item (Refugee Application)"],
  [/bedrock_buster|happy_ghast_horn/, "Late-game scripted item"],
];

export function computeFlags(data) {
  const itemsByKey = new Map(data.items.map((item) => [item.key, item]));
  const advById = new Map(data.advancements.map((entry) => [entry.id, entry]));
  const lootById = new Map(data.loot.map((table) => [table.id, table]));
  const flags = new Map();
  const flag = (key, reason) => {
    const entry = flags.get(key) || { reasons: [] };
    if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
    flags.set(key, entry);
  };
  const isFlagged = (key) => flags.has(key);
  const pathOf = (id) => id.split(":")[1];

  // ---------------------------------------------------------- advancements
  const ancestors = (entry) => {
    const chain = [];
    const seen = new Set();
    let current = entry;
    while (current?.parent && !seen.has(current.parent)) {
      seen.add(current.parent);
      chain.push(current.parent);
      current = advById.get(current.parent);
    }
    return chain;
  };
  for (const entry of data.advancements) {
    const key = `advancement:${entry.id}`;
    if (entry.hidden) flag(key, "Hidden advancement (hidden: true)");
    const tab = pathOf(entry.tab || entry.id);
    if (lateTab.test(pathOf(entry.id)) || lateTab.test(tab)) flag(key, `${titleCase(pathOf(entry.id).split("/")[0])} tab (late game)`);
    const lateAncestor = ancestors(entry).find((id) => lateMarkers.test(id));
    if (lateAncestor) flag(key, `Comes after ${lateAncestor} (late game)`);
    // Rule added after the first review: a child of a hidden advancement.
    const parent = entry.parent && advById.get(entry.parent);
    if (parent?.hidden) flag(key, `Child of hidden advancement ${parent.id}`);
  }

  // ---------------------------------------------------------- items
  for (const entry of data.advancements.filter((adv) => /secret/.test(adv.id))) {
    for (const criterion of entry.criteria) {
      for (const key of criterion.items || []) if (itemsByKey.has(key)) flag(`item:${key}`, `Secret food named by ${entry.id}`);
      if (criterion.recipe) {
        flag(`recipe:${criterion.recipe}`, `Secret meal named by ${entry.id}`);
        const recipe = data.recipes.find((r) => r.id === criterion.recipe);
        if (recipe) flag(`item:${recipe.result.key}`, `Secret meal named by ${entry.id}`);
      }
    }
  }
  for (const item of data.items) {
    // A vanilla item the pack renames is judged by its new name.
    const haystack = item.renamed ? item.name.toLowerCase().replaceAll(" ", "_") : item.key;
    for (const [pattern, reason] of lateFamilies) if (pattern.test(haystack)) flag(`item:${item.key}`, reason);
    if (item.custom && !item.texture) flag(`item:${item.key}`, "Unclear: no texture in the pack (possibly unfinished content)");
  }
  // Everything reachable from a treasure table (nested tables included).
  const reachable = (id, seen = new Set()) => {
    if (seen.has(id)) return [];
    seen.add(id);
    const table = lootById.get(id);
    if (!table) return [];
    return [...table.drops.map((drop) => drop.key), ...(table.includes || []).flatMap((child) => reachable(child, seen))];
  };
  for (const table of data.loot) {
    if (!treasurePath.test(pathOf(table.id))) continue;
    for (const key of reachable(table.id)) if (itemsByKey.has(key)) flag(`item:${key}`, `Rare treasure (${table.id})`);
  }
  for (const table of data.loot.filter((entry) => /_recipe$/.test(entry.id))) {
    for (const drop of table.drops) flag(`item:${drop.key}`, `Recipe note (${table.id})`);
  }
  for (const entry of data.fish || []) if (entry.stars >= 3) flag(`item:${entry.key}`, `${entry.tier} fishing catch`);
  for (const entry of data.advancements.filter((adv) => adv.hidden && !/anglers_almanac\//.test(adv.id))) {
    for (const criterion of entry.criteria) {
      for (const key of criterion.items || []) {
        if (itemsByKey.get(key)?.custom) flag(`item:${key}`, `Named by hidden advancement ${entry.id}`);
      }
    }
  }
  // Rule added after the first review: every item a criterion names is a spoiler.
  for (const entry of data.advancements) {
    const named = [...new Set(entry.criteria.flatMap((criterion) => criterion.items || []))].filter((key) => itemsByKey.has(key));
    if (named.length && named.every((key) => isFlagged(`item:${key}`))) flag(`advancement:${entry.id}`, "Its criteria name only spoiler items");
  }

  // ---------------------------------------------------------- recipes
  for (const recipe of data.recipes) {
    const key = `recipe:${recipe.id}`;
    if (isFlagged(`item:${recipe.result.key}`)) flag(key, "Result is a spoiler item");
    const input = recipe.ingredientKeys.find((itemKey) => isFlagged(`item:${itemKey}`) && itemsByKey.get(itemKey)?.custom);
    if (input) flag(key, `Uses spoiler ingredient ${input}`);
    if (recipe.id.startsWith("debug:")) flag(key, "Debug recipe");
    if (recipe.unlockedBy?.length && recipe.unlockedBy.every((id) => isFlagged(`advancement:${id}`))) flag(key, "Only unlocked by spoiler advancements");
  }

  // ---------------------------------------------------------- loot, places
  for (const table of data.loot) {
    const key = `loot:${table.id}`;
    if (treasurePath.test(pathOf(table.id))) flag(key, "Treasure table");
    const contents = table.drops.map((drop) => drop.key).filter((itemKey) => itemsByKey.has(itemKey));
    if (contents.length && contents.every((itemKey) => isFlagged(`item:${itemKey}`))) flag(key, "Every item in it is a spoiler");
  }
  const dimensionOf = new Map((data.worldgen?.biomes || []).map((biome) => [biome.id, biome.dimension]));
  for (const structure of data.structures || []) {
    const dimensions = new Set(structure.biomes.map((biome) => dimensionOf.get(biome)).filter(Boolean));
    if (dimensions.size && [...dimensions].every((dimension) => dimension !== "overworld")) flag(`structure:${structure.id}`, "Nether/End location (late game)");
  }
  for (const group of data.mechanics?.groups || []) {
    for (const [pattern, reason] of mechanicRules) if (pattern.test(group.id)) flag(`mechanic:${group.id}`, reason);
  }
  for (const enchantment of data.enchantments || []) {
    for (const [pattern, reason] of lateFamilies) if (pattern.test(enchantment.id)) flag(`enchantment:${enchantment.id}`, reason);
  }

  // ---------------------------------------------------------- hints
  const spoilerNames = new Set();
  for (const [key] of flags) {
    const name = key.startsWith("item:") ? itemsByKey.get(key.slice(5))?.name : key.startsWith("advancement:") ? advById.get(key.slice(12))?.title : null;
    if (name && name.length > 2) spoilerNames.add(name.toLowerCase());
  }
  const safe = (textValue, fallback) => ([...spoilerNames].some((name) => textValue.toLowerCase().includes(name)) ? fallback : textValue);
  const tabTitle = (entry) => {
    const root = advById.get(entry?.tab);
    return root && !isFlagged(`advancement:${root.id}`) ? root.title : "a later";
  };
  const places = new Map();
  for (const table of data.loot) {
    if (!["chests", "entities", "fishing", "archaeology", "shearing", "gameplay"].includes(table.category)) continue;
    if (isFlagged(`loot:${table.id}`) && table.category !== "chests") continue;
    for (const drop of table.drops) places.set(drop.key, [...(places.get(drop.key) || []), table.label + (table.category === "chests" ? " chests" : table.category === "entities" ? " drops" : "")]);
  }
  const hintFor = (key) => {
    const [kind, ...rest] = key.split(":");
    const id = rest.join(":");
    if (kind === "advancement") {
      const entry = advById.get(id);
      const parent = entry?.parent && advById.get(entry.parent);
      const after = parent && !isFlagged(`advancement:${parent.id}`) ? `, after “${parent.title}”` : "";
      return safe(`${entry?.hidden ? "Hidden advancement" : "Advancement"} in the ${tabTitle(entry)} tab${after}.`, "An advancement found later in the game.");
    }
    if (kind === "item") {
      const found = places.get(id) || [];
      const made = data.recipes.find((recipe) => recipe.result.key === id && recipe.origin !== "vanilla");
      const fish = (data.fish || []).find((entry) => entry.key === id);
      if (found.length) return safe(`Found in ${[...new Set(found)].slice(0, 2).join(" or ")}.`, "Found later in the game.");
      if (made) return `Made at the ${made.stationLabel}.`;
      if (fish) return `A ${fish.tier.toLowerCase()} fishing catch.`;
      return "Found later in the game.";
    }
    if (kind === "recipe") {
      const recipe = data.recipes.find((entry) => entry.id === id);
      if (!recipe) return "A recipe found later in the game.";
      const unlock = recipe.unlockedBy.map((advId) => advById.get(advId)).find((adv) => adv && !isFlagged(`advancement:${adv.id}`));
      return safe(`Made at the ${recipe.stationLabel}${unlock ? `; unlocks with “${unlock.title}”` : ""}.`, `Made at the ${recipe.stationLabel}.`);
    }
    if (kind === "loot") return "A loot pool with a hidden reward.";
    if (kind === "mechanic") return "A system you will discover while playing.";
    if (kind === "structure") return "A place you will discover while playing.";
    if (kind === "enchantment") return "An enchantment found later in the game.";
    return "Revealed later in the game.";
  };

  const keys = [
    ...data.items.map((item) => `item:${item.key}`),
    ...data.recipes.filter((recipe) => recipe.origin !== "vanilla").map((recipe) => `recipe:${recipe.id}`),
    ...data.advancements.map((entry) => `advancement:${entry.id}`),
    ...data.loot.map((table) => `loot:${table.id}`),
    ...(data.structures || []).map((structure) => `structure:${structure.id}`),
    ...(data.mechanics?.groups || []).map((group) => `mechanic:${group.id}`),
    ...(data.enchantments || []).map((enchantment) => `enchantment:${enchantment.id}`),
  ];
  // Vanilla recipes are only listed when they are spoilers.
  const listed = new Set(keys);
  for (const [key] of flags) if (key.startsWith("recipe:") && !listed.has(key)) keys.push(key);
  return { flags, hintFor, keys };
}

function compactReasons(reasons) {
  const grouped = new Map();
  for (const reason of reasons) {
    const match = reason.match(/^(.*?) \((.*)\)$/);
    const [label, detail] = match ? [match[1], match[2]] : [reason, null];
    const list = grouped.get(label) || [];
    if (detail && !list.includes(detail)) list.push(detail);
    grouped.set(label, list);
  }
  return [...grouped].map(([label, details]) => (details.length ? `${label} (${details.join(", ")})` : label)).join("; ");
}

export const signature = (entry) =>
  crypto.createHash("sha1").update(JSON.stringify([entry.spoiler, entry.reason, entry.hint])).digest("hex").slice(0, 10);

function main() {
  const index = readJson(indexFile);
  if (!index?.versions?.length) throw new Error("No published versions (public/data/versions.json).");
  const previous = readJson(spoilerFile);
  const oldEntries = previous?.entries || {};
  // Default version first: its flags win for IDs that several versions share.
  const ordered = [...index.versions].sort((a, b) => (a.id === index.default ? -1 : b.id === index.default ? 1 : 0));
  const entries = {};
  let keptManual = 0;
  for (const version of ordered) {
    const data = readJson(path.join(projectRoot, "public", version.file));
    if (!data) continue;
    const { flags, hintFor, keys } = computeFlags(data);
    for (const key of keys) {
      if (key in entries) continue;
      const old = oldEntries[key];
      if (old && (old.manual || (old.sig && old.sig !== signature(old)))) {
        const rest = { ...old };
        delete rest.sig;
        entries[key] = { ...rest, manual: true };
        keptManual += 1;
        continue;
      }
      const found = flags.get(key);
      const entry = found
        ? { spoiler: true, reason: compactReasons(found.reasons), hint: hintFor(key) }
        : { spoiler: false, reason: "No spoiler signal", hint: "" };
      entry.sig = signature(entry);
      entries[key] = entry;
    }
  }
  const orphans = Object.fromEntries(
    Object.entries({ ...(previous?.orphans || {}), ...oldEntries }).filter(
      ([key, value]) => !(key in entries) && (value.manual || (value.sig && value.sig !== signature(value))),
    ),
  );
  const counts = {};
  for (const [key, entry] of Object.entries(entries)) {
    const kind = key.split(":")[0];
    counts[kind] ||= { total: 0, spoiler: 0 };
    counts[kind].total += 1;
    if (entry.spoiler) counts[kind].spoiler += 1;
  }
  const header = {
    schema: 2,
    about:
      "Spoiler flags for the display layer only. The data files always contain everything. " +
      "Edit spoiler/reason/hint freely (or set manual: true); edited entries are kept when the flags are regenerated. " +
      "Hints are shown in Spoiler-free mode and must not name the thing they hide.",
    versions: ordered.map((version) => version.id),
    counts,
  };
  const lines = Object.entries(entries).map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
  const body =
    `{\n${Object.entries(header).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(",\n")},\n` +
    `  "entries": {\n${lines.join(",\n")}\n  },\n` +
    `  "orphans": ${JSON.stringify(orphans)}\n}\n`;
  fs.writeFileSync(`${spoilerFile}.next`, body);
  fs.renameSync(`${spoilerFile}.next`, spoilerFile);
  const flagged = Object.values(entries).filter((entry) => entry.spoiler).length;
  console.log(`Spoiler flags: ${flagged} of ${Object.keys(entries).length} entries flagged (${keptManual} manual entries kept).`);
  for (const [kind, count] of Object.entries(counts)) console.log(`  ${kind}: ${count.spoiler}/${count.total}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
