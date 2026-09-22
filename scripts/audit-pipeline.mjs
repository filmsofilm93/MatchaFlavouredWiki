// Audit the generated wiki data against a raw pack checkout.
//
//   node scripts/audit-pipeline.mjs <packRoot> [wiki-data.json] [--json=<out>]
//
// It (1) counts what the pack contains versus what the generator extracted,
// (2) spot-checks recipes and advancements by re-reading the raw files with a
// deliberately independent parser, and (3) prints a Markdown report.
import fs from "node:fs";
import path from "node:path";

const packRoot = path.resolve(process.argv[2] || "");
const dataFile = path.resolve(
  process.argv.find((v, i) => i > 2 && !v.startsWith("--")) ||
    "app/data/wiki-data.json",
);
const jsonOut = (process.argv.find((v) => v.startsWith("--json=")) || "").slice(
  7,
);
if (!fs.existsSync(path.join(packRoot, "data"))) {
  console.error("Usage: node scripts/audit-pipeline.mjs <packRoot> [data]");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
const read = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : [p];
      })
    : [];
const rel = (file) => path.relative(packRoot, file).split(path.sep).join("/");
const ns = (id, d = "minecraft") =>
  !id
    ? ""
    : id.replace(/^#/, "").includes(":")
      ? id.replace(/^#/, "")
      : `${d}:${id.replace(/^#/, "")}`;

// ---------------------------------------------------------------- inventory
const files = walk(path.join(packRoot, "data")).map(rel);
const byKind = (kind) =>
  files.filter((f) => f.split("/")[2] === kind && f.endsWith(".json"));
const vanillaArg = (
  process.argv.find((v) => v.startsWith("--vanilla-dir=")) || ""
).slice(14);
const lang = {
  ...(vanillaArg
    ? read(path.join(vanillaArg, "assets/minecraft/lang/en_us.json")) || {}
    : {}),
  ...(read(path.join(packRoot, "assets/minecraft/lang/en_us.json")) || {}),
};

const recipeFiles = byKind("recipe");
const advancementFiles = byKind("advancement");
const advancements = advancementFiles.map((f) => ({
  file: f,
  id: `${f.split("/")[1]}:${f
    .split("/")
    .slice(3)
    .join("/")
    .replace(/\.json$/, "")}`,
  json: read(path.join(packRoot, f)),
}));
const displayed = advancements.filter((a) => a.json?.display);
const hidden = displayed.filter((a) => a.json.display.hidden === true);
const rewardRecipes = advancements.filter(
  (a) => a.json?.rewards?.recipes?.length,
);
const lootFiles = byKind("loot_table");
const lootByFolder = {};
for (const f of lootFiles) {
  const folder = f.split("/")[3]?.replace(/\.json$/, "") || "(root)";
  lootByFolder[folder] = (lootByFolder[folder] || 0) + 1;
}
const tradeFiles = byKind("villager_trade");
const tradeByProfession = {};
for (const f of tradeFiles) {
  const prof = f.split("/")[3];
  tradeByProfession[prof] = (tradeByProfession[prof] || 0) + 1;
}
const worldgen = {};
for (const f of files.filter((x) => x.split("/")[2] === "worldgen")) {
  const kind = f.split("/")[3];
  worldgen[kind] = (worldgen[kind] || 0) + 1;
}
const functionFiles = files.filter((f) => f.endsWith(".mcfunction"));
const itemLangKeys = Object.keys(lang).filter((k) =>
  /^item\.|^block\./.test(k),
);

const inventory = {
  recipes: { pack: recipeFiles.length, generated: data.recipes.length },
  advancements: {
    packFiles: advancementFiles.length,
    withDisplay: displayed.length,
    hidden: hidden.length,
    noDisplay: advancementFiles.length - displayed.length,
    rewardingRecipes: rewardRecipes.length,
    generated: data.advancements.length,
    generatedHidden: data.advancements.filter((a) => a.hidden).length,
  },
  items: {
    generated: data.items.length,
    langItemAndBlockKeys: itemLangKeys.length,
    placeholderTexture: data.items.filter((i) => i.textureMissing).length,
  },
  lootTables: { pack: lootFiles.length, byFolder: lootByFolder, generated: 0 },
  villagerTrades: {
    pack: tradeFiles.length,
    tradeSets: byKind("trade_set").length,
    byProfession: tradeByProfession,
    generated: (data.fish || []).length,
    generatedNote: "only fisherman trades, used for the fish list",
  },
  worldgen: { pack: worldgen, generated: 0 },
  functions: { pack: functionFiles.length, generated: 0 },
  structures: { packNbt: files.filter((f) => f.endsWith(".nbt")).length },
  handWrittenLocations: (data.locations || []).length,
};

// ------------------------------------------------------- recipe spot checks
function rawIngredientTokens(raw, d = "minecraft") {
  if (Array.isArray(raw))
    return [
      raw
        .map((x) => rawIngredientTokens(x, d))
        .flat()
        .sort()
        .join("|"),
    ];
  if (typeof raw === "string")
    return [raw.startsWith("#") ? `#${ns(raw, d)}` : ns(raw, d)];
  if (raw?.tag) return [`#${ns(raw.tag, d)}`];
  if (raw?.item || raw?.id) return [ns(raw.item || raw.id, d)];
  return ["?"];
}
function rawTokens(recipe) {
  const t = recipe.type || "";
  if (t.includes("crafting_shaped")) {
    const out = [];
    for (const row of recipe.pattern || [])
      for (const ch of row)
        if (ch !== " ") out.push(...rawIngredientTokens(recipe.key[ch]));
    return out;
  }
  if (t.includes("crafting_shapeless"))
    return (recipe.ingredients || []).flatMap((x) => rawIngredientTokens(x));
  if (t.includes("smithing"))
    return [recipe.template, recipe.base, recipe.addition]
      .filter(Boolean)
      .flatMap((x) => rawIngredientTokens(x));
  return rawIngredientTokens(recipe.ingredient ?? recipe.input);
}
function generatedTokens(recipe) {
  return recipe.ingredients.map((g) =>
    g.tag ? `#${g.tag}` : [...g.keys].sort().join("|"),
  );
}
const expectedStation = (type) =>
  type.includes("crafting")
    ? "crafting"
    : type.includes("stonecut")
      ? "stonecutting"
      : type.includes("smithing")
        ? "smithing"
        : type.includes("blasting")
          ? "blasting"
          : type.includes("smoking")
            ? "smoking"
            : type.includes("campfire")
              ? "campfire"
              : type.includes("smelting")
                ? "furnace"
                : "?";

const recipesById = new Map(data.recipes.map((r) => [r.id, r]));
const itemsByKey = new Map(data.items.map((i) => [i.key, i]));
// Deterministic stratified sample: every 7th recipe of each station, plus
// named edge cases (alloys, smithing, custom stations, secret foods).
const stations = [...new Set(data.recipes.map((r) => r.station))].sort();
const sample = new Set([
  "main:food/crafting/gnocchi",
  "main:food/crafting/chorus_mochi",
  "main:crafting/electrum_alloy",
  "main:crafting/bronze_alloy",
  "main:crafting/bookshelf",
  "main:crafting/wooden_hoe",
]);
for (const station of stations) {
  const list = data.recipes.filter((r) => r.station === station);
  for (
    let i = 3;
    i < list.length &&
    [...sample].filter((id) => recipesById.get(id)?.station === station)
      .length < 3;
    i += 7
  ) {
    sample.add(list[i].id);
  }
}
function checkRecipe(id) {
  const g = recipesById.get(id);
  const [namespace, p] = id.split(":");
  const file = path.join(packRoot, "data", namespace, "recipe", `${p}.json`);
  const raw = read(file);
  if (!g || !raw) {
    return {
      id,
      ok: false,
      notes: [!g ? "missing from generated data" : "raw file missing"],
    };
  }
  const notes = [];
  const rawResultId = ns(
    typeof raw.result === "string"
      ? raw.result
      : raw.result?.id || raw.result?.item,
  );
  const rawModel = raw.result?.components?.["minecraft:item_model"];
  const item = itemsByKey.get(g.result.key);
  if (item?.id !== rawResultId)
    notes.push(`result id ${item?.id} ≠ ${rawResultId}`);
  if (rawModel && g.result.key !== ns(rawModel))
    notes.push(`result model ${g.result.key} ≠ ${rawModel}`);
  const rawCount = Number(raw.result?.count || 1);
  if (g.result.count !== rawCount)
    notes.push(`count ${g.result.count} ≠ ${rawCount}`);
  const a = rawTokens(raw).sort();
  const b = generatedTokens(g).sort();
  // Tags expand on the generated side, so compare tag tokens to tag tokens and
  // plain items to plain items.
  if (JSON.stringify(a) !== JSON.stringify(b))
    notes.push(`ingredients ${JSON.stringify(b)} ≠ raw ${JSON.stringify(a)}`);
  if (g.station !== expectedStation(raw.type))
    notes.push(`station ${g.station} ≠ ${expectedStation(raw.type)}`);
  if ((raw.cookingtime || 0) !== g.cookingTime)
    notes.push(`cook ${g.cookingTime} ≠ ${raw.cookingtime}`);
  const rawName = raw.result?.components?.["minecraft:item_name"];
  return {
    id,
    station: g.stationLabel,
    output: `${g.result.count}× ${item?.name}`,
    inputs: g.ingredients.map((x) => x.label).join(", "),
    cook: g.cookingTime ? `${g.cookingTime / 20}s` : "",
    nameSource: rawName ? "item_name component" : "lang/id",
    ok: notes.length === 0,
    notes,
  };
}
const recipeChecks = [...sample].map(checkRecipe);
const sweep = data.recipes.map((r) => checkRecipe(r.id));
const sweepFailures = sweep.filter((c) => !c.ok);

// -------------------------------------------------- advancement spot checks
const text = (c) =>
  typeof c === "string"
    ? c
    : Array.isArray(c)
      ? c.map(text).join("")
      : (c?.text ??
        (c?.translate ? (lang[c.translate] ?? `[${c.translate}]`) : "") +
          (c?.extra ? text(c.extra) : ""));
const advById = new Map(data.advancements.map((a) => [a.id, a]));
const advSample = [
  ...displayed
    .filter((a) => !a.json.display.hidden)
    .filter((_, i) => i % 9 === 2)
    .slice(0, 8),
  ...hidden.filter((_, i) => i % 25 === 1).slice(0, 4),
  ...displayed.filter((a) => a.json.rewards?.recipes?.length).slice(0, 2),
];
const advChecks = advSample.map((a) => {
  const g = advById.get(a.id);
  const d = a.json.display;
  const notes = [];
  if (!g)
    return { id: a.id, ok: false, notes: ["missing from generated data"] };
  const title = text(d.title).replace(/§./g, "").trim();
  if (g.title !== title) notes.push(`title "${g.title}" ≠ "${title}"`);
  if ((d.frame || "task") !== g.frame)
    notes.push(`frame ${g.frame} ≠ ${d.frame || "task"}`);
  if ((d.hidden === true) !== g.hidden)
    notes.push(`hidden ${g.hidden} ≠ ${d.hidden === true}`);
  if ((a.json.parent || null) !== g.parent)
    notes.push(`parent ${g.parent} ≠ ${a.json.parent}`);
  const missing = [];
  if (a.json.criteria && !("criteria" in g))
    missing.push(`${Object.keys(a.json.criteria).length} criteria`);
  if (a.json.rewards?.recipes && !("unlocks" in g))
    missing.push(`${a.json.rewards.recipes.length} recipe rewards`);
  if (a.json.rewards?.loot && !("rewards" in g)) missing.push("loot reward");
  return {
    id: a.id,
    title: g.title,
    frame: g.frame,
    hidden: g.hidden,
    parent: g.parent,
    ok: notes.length === 0,
    notes,
    notExtracted: missing,
  };
});

// ------------------------------------------------------------------ output
const report = {
  packRoot,
  dataFile,
  inventory,
  recipeChecks,
  sweepFailures,
  advChecks,
};
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
const pass = (l) => `${l.filter((x) => x.ok).length}/${l.length}`;
console.log(`# Pipeline audit\n`);
console.log(
  "## Inventory\n```json\n" + JSON.stringify(inventory, null, 2) + "\n```\n",
);
console.log(`## Recipe spot checks (${pass(recipeChecks)} match)\n`);
for (const c of recipeChecks)
  console.log(
    `- ${c.ok ? "✅" : "❌"} \`${c.id}\` — ${c.station || ""}: ${c.inputs || ""} → ${c.output || ""} ${c.cook || ""} ${c.notes.join("; ")}`,
  );
console.log(
  `\nFull sweep of all ${sweep.length} generated recipes: ${sweep.length - sweepFailures.length} match the raw files.`,
);
for (const c of sweepFailures.slice(0, 20))
  console.log(`- ❌ \`${c.id}\` ${c.notes.join("; ")}`);
console.log(`\n## Advancement spot checks (${pass(advChecks)} match)\n`);
for (const c of advChecks)
  console.log(
    `- ${c.ok ? "✅" : "❌"} \`${c.id}\` "${c.title}" [${c.frame}${c.hidden ? ", hidden" : ""}] parent=${c.parent} ${c.notes.join("; ")}${c.notExtracted?.length ? ` · not extracted: ${c.notExtracted.join(", ")}` : ""}`,
  );
