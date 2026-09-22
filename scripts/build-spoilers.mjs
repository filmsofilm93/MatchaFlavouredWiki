// Generate app/data/spoilers.json: a spoiler / not-spoiler flag, a short
// reason, and a spoiler-free hint for every item, recipe, advancement, loot
// table, mechanic, and location. The flags only drive what the site DISPLAYS;
// wiki-data.json always contains everything.
//
//   node scripts/build-spoilers.mjs <packRoot> [wiki-data.json] [spoilers.json]
//
// Manual edits survive regeneration: an entry with "manual": true, or whose
// spoiler/reason/hint no longer match the signature written at generation
// time, is kept exactly as it is.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const packRoot = path.resolve(process.argv[2] || "");
const dataFile = path.resolve(
  process.argv[3] || path.join(projectRoot, "app/data/wiki-data.json"),
);
const spoilerFile = path.resolve(
  process.argv[4] || path.join(projectRoot, "app/data/spoilers.json"),
);

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const absolute = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(absolute) : [absolute];
      })
    : [];
const normalizeId = (value, fallback = "minecraft") => {
  if (!value || typeof value !== "string") return "";
  const clean = value.replace(/^#/, "");
  return clean.includes(":") ? clean : `${fallback}:${clean}`;
};
const titleCase = (value) =>
  value
    .replace(/^.*:/, "")
    .replace(/[/.]/g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

if (!fs.existsSync(path.join(packRoot, "data"))) {
  console.error("Usage: node scripts/build-spoilers.mjs <packRoot> [data]");
  process.exit(1);
}
const data = readJson(dataFile);
const previous = readJson(spoilerFile);

const itemsByKey = new Map(data.items.map((item) => [item.key, item]));
const advById = new Map(data.advancements.map((entry) => [entry.id, entry]));

// A "custom" item is one the pack defines or renames. Plain vanilla items
// (sticks, string, cod) are never spoilers on their own.
const packLang =
  readJson(path.join(packRoot, "assets/minecraft/lang/en_us.json")) || {};
function isCustom(item) {
  if (!item) return false;
  if (item.key !== item.id) return true;
  const [namespace, itemPath] = item.id.split(":");
  return Boolean(
    packLang[`item.${namespace}.${itemPath}`] ||
    packLang[`block.${namespace}.${itemPath}`],
  );
}

// ------------------------------------------------------------ loot tables
const lootTables = new Map();
for (const file of walk(path.join(packRoot, "data"))) {
  const relative = path.relative(packRoot, file).split(path.sep).join("/");
  const parts = relative.split("/");
  if (parts[2] !== "loot_table" || !file.endsWith(".json")) continue;
  const id = `${parts[1]}:${parts
    .slice(3)
    .join("/")
    .replace(/\.json$/, "")}`;
  const items = new Set();
  const tables = new Set();
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (node.type === "minecraft:item" && typeof node.name === "string") {
      const setComponents = (node.functions || []).find(
        (fn) => fn?.function === "minecraft:set_components",
      );
      const model = setComponents?.components?.["minecraft:item_model"];
      items.add(normalizeId(model || node.name));
    }
    if (
      node.type === "minecraft:loot_table" &&
      typeof node.value === "string"
    ) {
      tables.add(normalizeId(node.value));
    }
    Object.values(node).forEach(visit);
  };
  visit(readJson(file));
  lootTables.set(id, { id, items, tables });
}
function lootItems(id, seen = new Set()) {
  if (seen.has(id)) return new Set();
  seen.add(id);
  const table = lootTables.get(id);
  if (!table) return new Set();
  const all = new Set(table.items);
  for (const child of table.tables) {
    for (const item of lootItems(child, seen)) all.add(item);
  }
  return all;
}
function lootLabel(id) {
  const [, tablePath] = id.split(":");
  const parts = tablePath.split("/");
  const name = titleCase(parts.at(-1));
  switch (parts[0]) {
    case "chests":
      return `${titleCase(parts.slice(1).join(" "))} chests`;
    case "entities":
      return `${name} drops`;
    case "archaeology":
      return `${name} archaeology`;
    case "blocks":
      return `breaking ${name}`;
    case "gameplay":
      // Per-fish sub-tables would print the fish's own name; the regional
      // tables that include them are labelled instead.
      if (parts[1] === "fishing" && parts.length > 3) return null;
      return parts[1] === "fishing" ? `fishing (${name})` : null;
    case "shearing":
      return `shearing ${name}`;
    default:
      return null;
  }
}
// item key -> direct "place" sources (chests, mobs, fishing, archaeology...)
const itemPlaces = new Map();
for (const id of lootTables.keys()) {
  const label = lootLabel(id);
  if (!label) continue;
  for (const item of lootItems(id)) {
    const list = itemPlaces.get(item) || [];
    list.push({ table: id, label });
    itemPlaces.set(item, list);
  }
}

// ------------------------------------------------------------- signals
const flags = new Map(); // key -> { reasons: [], hint }
const flag = (key, reason) => {
  const entry = flags.get(key) || { reasons: [] };
  if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
  flags.set(key, entry);
};

// Advancement ancestry, used for "late game" tabs and chains.
function ancestors(entry) {
  const chain = [];
  let current = entry;
  const seen = new Set();
  while (current?.parent && !seen.has(current.parent)) {
    seen.add(current.parent);
    chain.push(current.parent);
    current = advById.get(current.parent);
  }
  return chain;
}
const lateMarkers =
  /(^|\/)(enter_nether|find_stronghold|enter_end|kill_dragon)$/;
const lateSections = { end: "End", hell: "Nether" };

for (const entry of data.advancements) {
  const key = `advancement:${entry.id}`;
  if (entry.hidden) flag(key, "Hidden advancement (hidden: true)");
  const tab = entry.id.split(":")[1].split("/")[0];
  if (lateSections[tab]) {
    flag(key, `${lateSections[tab]} tab (late game)`);
  }
  const lateAncestor = ancestors(entry).find((id) => lateMarkers.test(id));
  if (lateAncestor) {
    flag(key, `Comes after ${lateAncestor} (late game)`);
  }
}

// Secret ingredients and secret meals, as named by the pack's own
// "secret" advancements.
for (const entry of data.advancements.filter((adv) => /secret/.test(adv.id))) {
  for (const criterion of entry.criteria) {
    for (const model of [
      ...(criterion.models || []),
      ...(criterion.items || []),
    ]) {
      if (itemsByKey.has(model)) {
        flag(`item:${model}`, `Secret food named by ${entry.id}`);
      }
    }
    if (criterion.recipe) {
      const recipe = data.recipes.find((r) => r.id === criterion.recipe);
      flag(`recipe:${criterion.recipe}`, `Secret meal named by ${entry.id}`);
      if (recipe) {
        flag(`item:${recipe.result.key}`, `Secret meal named by ${entry.id}`);
      }
    }
  }
}

// Late-game material families.
const lateFamilies = [
  [/adamant/, "Adamant (late-game alloy)"],
  [/netherite/, "Netherite (late game)"],
  [/elytra/, "Elytra (End)"],
  [/electrum/, "Electrum (needs a Divine Fragment)"],
  [
    /dragon|shulker|chorus|purpur|end_crystal|end_rod|end_stone/,
    "End material",
  ],
];
for (const item of data.items) {
  // Match the item's own model, not its base item: Shakudo Alloy is built on a
  // shulker shell, which says nothing about where Shakudo comes from.
  const haystack = item.key;
  // A vanilla item the pack renames (e.g. shulker_shell = Shakudo Alloy) is
  // judged by its new name, not its vanilla ID.
  const [itemNamespace, itemPath] = item.id.split(":");
  const renamed =
    item.key === item.id &&
    Boolean(
      packLang[`item.${itemNamespace}.${itemPath}`] ||
      packLang[`block.${itemNamespace}.${itemPath}`],
    );
  for (const [pattern, reason] of lateFamilies) {
    if (pattern.test(renamed ? item.name.toLowerCase() : haystack)) {
      flag(`item:${item.key}`, reason);
    }
  }
  if (item.textureMissing) {
    flag(
      `item:${item.key}`,
      "Unclear: no texture in the pack (possibly unfinished content)",
    );
  }
}

// Rare treasures: anything reachable from the pack's treasure tables.
for (const id of lootTables.keys()) {
  const [, tablePath] = id.split(":");
  if (!/^(treasure|kleis_items|music_disc)\//.test(tablePath)) continue;
  for (const item of lootItems(id)) {
    if (itemsByKey.has(item)) flag(`item:${item}`, `Rare treasure (${id})`);
  }
}

// Recipe notes found as loot (e.g. the Gnocchi cooking recipe).
const nameToKeys = new Map();
for (const item of data.items) {
  const list = nameToKeys.get(item.name) || [];
  list.push(item.key);
  nameToKeys.set(item.name, list);
}
const recipeNoteTargets = new Set();
for (const [id, table] of lootTables) {
  if (!/_recipe$/.test(id)) continue;
  const raw = readJson(
    path.join(
      packRoot,
      "data",
      id.split(":")[0],
      "loot_table",
      `${id.split(":")[1]}.json`,
    ),
  );
  const loreKeys =
    JSON.stringify(raw).match(/item\.kleispack\.[a-z_.]+/g) || [];
  for (const langKey of loreKeys) {
    const name = packLang[langKey];
    for (const key of nameToKeys.get(name) || []) {
      recipeNoteTargets.add(key);
      flag(`item:${key}`, `Recipe learned from a found note (${id})`);
    }
  }
  for (const item of table.items) {
    if (itemsByKey.has(item)) flag(`item:${item}`, `Recipe note (${id})`);
  }
}

// Rare and epic fish.
for (const entry of data.fish || []) {
  if (entry.stars >= 3) {
    flag(`item:${entry.itemKey}`, `${entry.tier} fishing catch`);
  }
}

// Items named by hidden advancements. Only items the pack defines through an
// item model count; renamed vanilla basics (Obol, Sulfur, leather) are
// ordinary finds.
for (const entry of data.advancements.filter(
  // The Angler's Almanac hides every entry until caught (a collection log);
  // fish are graded by the Rare/Epic tier rule above instead.
  (adv) => adv.hidden && !/anglers_almanac\//.test(adv.id),
)) {
  for (const criterion of entry.criteria) {
    for (const model of [
      ...(criterion.models || []),
      ...(criterion.items || []),
    ]) {
      const item = itemsByKey.get(model);
      if (item && item.key !== item.id) {
        flag(`item:${model}`, `Named by hidden advancement ${entry.id}`);
      }
    }
  }
}

// Recipes: spoiler when the result or a custom ingredient is a spoiler, when
// debug-only, or when every advancement that unlocks it is a spoiler.
const isFlagged = (key) => flags.has(key);
for (const recipe of data.recipes) {
  const key = `recipe:${recipe.id}`;
  if (isFlagged(`item:${recipe.result.key}`)) {
    flag(key, "Result is a spoiler item");
  }
  const spoilerInput = recipe.ingredientKeys.find(
    (itemKey) =>
      isFlagged(`item:${itemKey}`) && isCustom(itemsByKey.get(itemKey)),
  );
  if (spoilerInput) flag(key, `Uses spoiler ingredient ${spoilerInput}`);
  if (recipe.namespace === "debug") flag(key, "Debug recipe");
  if (
    recipe.unlockedBy?.length &&
    recipe.unlockedBy.every((id) => isFlagged(`advancement:${id}`))
  ) {
    flag(key, "Only unlocked by spoiler advancements");
  }
}

// Loot tables: spoiler when they hand out spoiler items or are treasure.
for (const id of lootTables.keys()) {
  const key = `loot:${id}`;
  const [, tablePath] = id.split(":");
  if (/^(treasure|kleis_items|music_disc)\//.test(tablePath)) {
    flag(key, "Treasure table");
  }
  // Ordinary tables (chests, mobs, fishing) stay visible; their individual
  // spoiler entries are hidden through the item flags instead. A table that
  // only hands out spoiler items is a spoiler as a whole.
  const contents = [...lootItems(id)].filter((item) => itemsByKey.has(item));
  if (contents.length && contents.every((item) => isFlagged(`item:${item}`))) {
    flag(key, "Every item in it is a spoiler");
  }
}

// Mechanics, one per function folder or file under */function/mechanic and
// */function/environmental.
const mechanics = new Map();
for (const file of walk(path.join(packRoot, "data"))) {
  const relative = path.relative(packRoot, file).split(path.sep).join("/");
  const match = relative.match(
    /^data\/([^/]+)\/function\/(mechanic|environmental)\/([^/.]+)/,
  );
  if (match) mechanics.set(`${match[1]}:${match[2]}/${match[3]}`, match[3]);
}
const mechanicRules = [
  [
    /eerie|village_(entity|jukebox|hopper)|kill_village/,
    "Lore / horror (village atmosphere)",
  ],
  [/first_dragon|wither/, "Boss / late-game event"],
  [
    /amnestic|clay_statue|cheerful|mournful/,
    "Scripted item effect (discovery)",
  ],
  [/application/, "Scripted item (Refugee Application)"],
  [/bedrock_buster|happy_ghast_horn/, "Late-game scripted item"],
];
for (const [id, name] of mechanics) {
  for (const [pattern, reason] of mechanicRules) {
    if (pattern.test(name)) flag(`mechanic:${id}`, reason);
  }
}

// Hand-written location entries carried over from the base wiki.
for (const location of data.locations || []) {
  const text = JSON.stringify(location).toLowerCase();
  if (/eerie|footsteps|notices you/.test(text)) {
    flag(`location:${location.id}`, "Lore / horror (village atmosphere)");
  }
  if (/other dimensions/i.test(location.group)) {
    flag(`location:${location.id}`, "Nether/End location (late game)");
  }
}

// ---------------------------------------------------------------- hints
const spoilerNames = new Set();
for (const [key] of flags) {
  if (key.startsWith("item:")) {
    const name = itemsByKey.get(key.slice(5))?.name;
    if (name && name.length > 2) spoilerNames.add(name.toLowerCase());
  }
  if (key.startsWith("advancement:")) {
    const title = advById.get(key.slice(12))?.title;
    if (title && title.length > 2) spoilerNames.add(title.toLowerCase());
  }
}
const safe = (text, fallback) => {
  const lower = text.toLowerCase();
  return [...spoilerNames].some((name) => lower.includes(name))
    ? fallback
    : text;
};
const tabTitle = (id) => {
  const [namespace, rest] = id.split(":");
  const root = advById.get(`${namespace}:${rest.split("/")[0]}/root`);
  return root && !flags.has(`advancement:${root.id}`)
    ? root.title
    : titleCase(rest.split("/")[0]);
};
function hintFor(key) {
  const [kind, ...restParts] = key.split(":");
  const id = restParts.join(":");
  if (kind === "advancement") {
    const entry = advById.get(id);
    const parent = entry?.parent && advById.get(entry.parent);
    const after =
      parent && !flags.has(`advancement:${parent.id}`)
        ? `, after “${parent.title}”`
        : "";
    return safe(
      `${entry?.hidden ? "Hidden advancement" : "Advancement"} in the ${tabTitle(id)} tab${after}.`,
      "An advancement found later in the game.",
    );
  }
  if (kind === "item") {
    const places = (itemPlaces.get(id) || []).filter(
      (place) =>
        !flags.has(`loot:${place.table}`) ||
        /^chests\//.test(place.table.split(":")[1]),
    );
    const made = data.recipes.find((recipe) => recipe.result.key === id);
    const fish = (data.fish || []).find((entry) => entry.itemKey === id);
    if (places.length) {
      return safe(
        `Found in ${places
          .slice(0, 2)
          .map((place) => place.label)
          .join(" or ")}.`,
        "Found later in the game.",
      );
    }
    if (made) return `Made at the ${made.stationLabel}.`;
    if (fish) return `A ${fish.tier.toLowerCase()} fishing catch.`;
    return "Found later in the game.";
  }
  if (kind === "recipe") {
    const recipe = data.recipes.find((entry) => entry.id === id);
    if (!recipe) return "A recipe found later in the game.";
    const unlock = recipe.unlockedBy
      .map((advId) => advById.get(advId))
      .find((adv) => adv && !flags.has(`advancement:${adv.id}`));
    return safe(
      `Made at the ${recipe.stationLabel}${unlock ? `; unlocks with “${unlock.title}”` : ""}.`,
      `Made at the ${recipe.stationLabel}.`,
    );
  }
  if (kind === "loot") return "A loot pool with a hidden reward.";
  if (kind === "mechanic") return "A system you will discover while playing.";
  if (kind === "location") return "A place you will discover while playing.";
  return "Revealed later in the game.";
}

// ---------------------------------------------------------------- output
// "Rare treasure (a); Rare treasure (b)" -> "Rare treasure (a, b)"
function compactReasons(reasons) {
  const grouped = new Map();
  for (const reason of reasons) {
    const match = reason.match(/^(.*?) \((.*)\)$/);
    const [label, detail] = match ? [match[1], match[2]] : [reason, null];
    const list = grouped.get(label) || [];
    if (detail && !list.includes(detail)) list.push(detail);
    grouped.set(label, list);
  }
  return [...grouped]
    .map(([label, details]) =>
      details.length ? `${label} (${details.join(", ")})` : label,
    )
    .join("; ");
}
const signature = (entry) =>
  crypto
    .createHash("sha1")
    .update(JSON.stringify([entry.spoiler, entry.reason, entry.hint]))
    .digest("hex")
    .slice(0, 10);

const allKeys = [
  ...data.items.map((item) => `item:${item.key}`),
  ...data.recipes.map((recipe) => `recipe:${recipe.id}`),
  ...data.advancements.map((entry) => `advancement:${entry.id}`),
  ...[...lootTables.keys()].map((id) => `loot:${id}`),
  ...[...mechanics.keys()].map((id) => `mechanic:${id}`),
  ...(data.locations || []).map((location) => `location:${location.id}`),
];

const oldEntries = previous?.entries || {};
const entries = {};
let keptManual = 0;
for (const key of allKeys) {
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
    ? {
        spoiler: true,
        reason: compactReasons(found.reasons),
        hint: hintFor(key),
      }
    : { spoiler: false, reason: "No spoiler signal", hint: "" };
  entry.sig = signature(entry);
  entries[key] = entry;
}
// Manual entries for things that no longer exist are kept under "orphans" so
// nothing you wrote is lost when the pack renames an ID.
const orphans = Object.fromEntries(
  Object.entries(oldEntries).filter(
    ([key, value]) =>
      !(key in entries) &&
      (value.manual || (value.sig && value.sig !== signature(value))),
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
  schema: 1,
  about:
    "Spoiler flags for the display layer only. wiki-data.json always contains everything. " +
    "Edit spoiler/reason/hint freely (or set manual: true); edited entries are kept when the flags are regenerated. " +
    "Hints are shown in Spoiler-free mode and must not name the thing they hide.",
  sourceVersion: data.release?.version || "",
  sourceVersionId: data.release?.versionId || "",
  counts,
};

// One entry per line keeps the file easy to read, diff, and hand-edit.
const lines = Object.entries(entries).map(
  ([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`,
);
const body =
  `{\n${Object.entries(header)
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(",\n")},\n` +
  `  "entries": {\n${lines.join(",\n")}\n  },\n` +
  `  "orphans": ${JSON.stringify(orphans)}\n}\n`;
fs.writeFileSync(`${spoilerFile}.next`, body);
fs.renameSync(`${spoilerFile}.next`, spoilerFile);

const flagged = Object.values(entries).filter((entry) => entry.spoiler).length;
console.log(
  `Spoiler flags: ${flagged} of ${allKeys.length} entries flagged` +
    ` (${keptManual} manual entries kept).`,
);
for (const [kind, count] of Object.entries(counts)) {
  console.log(`  ${kind}: ${count.spoiler}/${count.total}`);
}
