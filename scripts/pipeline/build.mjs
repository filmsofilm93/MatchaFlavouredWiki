// Build the wiki data for one pack version.
import fs from "node:fs";
import path from "node:path";
import { buildAdvancements } from "./advancements.mjs";
import { Assets } from "./assets.mjs";
import { buildEnchantments } from "./enchantments.mjs";
import { Items } from "./items.mjs";
import { Loot } from "./loot.mjs";
import { buildMechanics } from "./mechanics.mjs";
import { buildRecipes } from "./recipes.mjs";
import { compileFilter, Resources } from "./resources.mjs";
import { buildStructures } from "./structures.mjs";
import { Text } from "./text.mjs";
import { buildTrades } from "./trades.mjs";
import { readJson, splitId } from "./util.mjs";
import { buildWorldgen } from "./worldgen.mjs";

export const SCHEMA = 2;

// Loot table folders that describe where things come from. Vanilla block
// tables are only kept when they drop something other than the block.
const placeCategories = new Set(["chests", "entities", "gameplay", "fishing", "archaeology", "shearing", "pots", "spawners", "equipment", "harvest", "dispensers", "brush"]);

const fishTiers = { 1: ["Common", 1], 2: ["Uncommon", 2], 3: ["Rare", 3], 4: ["Epic", 4] };

export function buildVersion({ pack, vanilla, release, texDir }) {
  const packMeta = readJson(path.join(pack.metaRoot, "pack.mcmeta"));
  const resources = new Resources([
    { name: "pack", dataRoot: pack.dataRoot, assetsRoot: pack.assetsRoot, filter: compileFilter(packMeta) },
    { name: "vanilla", dataRoot: vanilla.dataRoot, assetsRoot: vanilla.assetsRoot },
  ]);
  const text = new Text(resources);
  const assets = new Assets(resources, texDir);
  const items = new Items(resources, text, assets);

  const enchantments = buildEnchantments({ resources, text, items });
  const { recipes, excludedVanillaCopies, stationLabels } = buildRecipes({ resources, text, items });
  const { advancements, tabs, recipeUnlocks } = buildAdvancements({ resources, text, items, recipes });
  const loot = new Loot({ resources, text, items });

  // Loot tables: every pack table, vanilla "place" tables, and anything they
  // or an advancement reward include.
  const wanted = new Set();
  for (const [id, hit] of resources.list("loot_table")) {
    const category = loot.category(id);
    if (hit.layer === "pack" || placeCategories.has(category)) wanted.add(id);
    else if (category === "blocks") {
      const drops = [...loot.dropsFor(id).keys()];
      const own = items.plain(`minecraft:${splitId(id)[1].split("/").at(-1)}`);
      if (drops.some((key) => key !== own)) wanted.add(id);
    }
  }
  for (const entry of [...advancements, ...recipeUnlocks]) entry.rewards.loot.forEach((id) => wanted.add(id));
  const tables = [];
  const queue = [...wanted];
  const done = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (done.has(id)) continue;
    done.add(id);
    const published = loot.publish(id);
    if (!published) continue;
    tables.push(published);
    for (const include of published.includes || []) if (!done.has(include)) queue.push(include);
  }
  tables.sort((a, b) => a.id.localeCompare(b.id));

  const trades = buildTrades({ resources, text, items, loot });
  const worldgen = buildWorldgen({ resources, text, items });
  const structures = buildStructures({ resources, text, items });
  const mechanics = buildMechanics({ resources, text });

  // Fish are what the fisherman buys. Their tier is the pack's own star
  // rating (lore "adv.kleispack.fishing.rarity.N"); without one, the order of
  // the levels that buy fish is used.
  const fish = [];
  const fisherman = trades.professions.find((profession) => profession.id === "fisherman");
  const tradeById = new Map(trades.trades.map((trade) => [trade.id, trade]));
  // A fish trade is the fisherman buying the fish for currency.
  const isFishTrade = (tradeId) => {
    const trade = tradeById.get(tradeId);
    return Boolean(trade?.wants && trade.gives && !/filler/.test(tradeId) &&
      trade.gives.key === "minecraft:emerald" && trade.wants.key !== "minecraft:emerald");
  };
  const fishLevels = (fisherman?.tiers || []).filter((tier) => tier.trades.some(isFishTrade));
  fishLevels.forEach((tier, rank) => {
    for (const tradeId of tier.trades.filter(isFishTrade)) {
      const trade = tradeById.get(tradeId);
      if (fish.some((entry) => entry.key === trade.wants.key)) continue;
      const stars = Math.min(4, trade.wants.stars || rank + 1);
      fish.push({ key: trade.wants.key, tier: fishTiers[stars][0], stars, sells: trade.wants.min, level: tier.level, trade: tradeId });
    }
  });

  // Items last: every module above has registered what it references.
  const itemList = items.finish();
  const missingTexture = itemList.filter((item) => !item.texture).map((item) => item.key);
  const glyphs = assets.glyphs();

  const stationCounts = {};
  for (const recipe of recipes) if (recipe.origin !== "vanilla") stationCounts[recipe.station] = (stationCounts[recipe.station] || 0) + 1;
  const packRecipes = recipes.filter((recipe) => recipe.origin !== "vanilla");

  return {
    schema: SCHEMA,
    release,
    stats: {
      packRecipes: packRecipes.length,
      recipes: recipes.length,
      vanillaCopiesExcluded: excludedVanillaCopies.length,
      items: itemList.length,
      customItems: itemList.filter((item) => item.custom).length,
      advancements: advancements.length,
      hiddenAdvancements: advancements.filter((entry) => entry.hidden).length,
      recipeUnlocks: recipeUnlocks.length,
      recipesWithoutUnlock: packRecipes.filter((recipe) => !recipe.unlockedBy.length).length,
      lootTables: tables.length,
      packLootTables: tables.filter((table) => table.origin === "pack").length,
      trades: trades.trades.length,
      fish: fish.length,
      ores: worldgen.ores.length,
      structures: structures.length,
      packStructures: structures.filter((structure) => structure.byPack).length,
      enchantments: enchantments.length,
      functions: mechanics.functionCount,
      untexturedItems: missingTexture.length,
      stationCounts,
    },
    stations: Object.entries(stationLabels).map(([id, label]) => ({ id, label, count: stationCounts[id] || 0 })),
    items: itemList,
    recipes,
    advancements,
    tabs,
    recipeUnlocks,
    loot: tables,
    trades,
    fish,
    worldgen,
    structures,
    enchantments,
    mechanics,
    glyphs,
  };
}

// ---------------------------------------------------------------- guards

// Categories whose collapse means the pipeline stopped understanding the pack.
export function countsOf(data) {
  return {
    "pack recipes": data.stats.packRecipes,
    advancements: data.stats.advancements,
    "custom items": data.stats.customItems,
    "pack loot tables": data.stats.packLootTables,
    trades: data.stats.trades,
    fish: data.stats.fish,
    ores: data.stats.ores,
    "pack structures": data.stats.packStructures,
    enchantments: data.stats.enchantments,
    "death system rules": data.mechanics.progression ? 1 : 0,
  };
}

export function checkForDrops(next, previous, { threshold = 0.25 } = {}) {
  const problems = [];
  const now = countsOf(next);
  for (const [name, value] of Object.entries(now)) {
    if (!value) problems.push(`${name}: none found`);
  }
  if (previous?.schema === SCHEMA) {
    const before = countsOf(previous);
    for (const [name, value] of Object.entries(now)) {
      const old = before[name] || 0;
      if (old >= 8 && value < old * (1 - threshold)) problems.push(`${name}: ${old} -> ${value}`);
    }
  }
  return problems;
}

// Ids in published data that point at nothing.
export function danglingReferences(data) {
  const keys = new Set(data.items.map((item) => item.key));
  const problems = [];
  for (const recipe of data.recipes) {
    if (!keys.has(recipe.result.key)) problems.push(`recipe ${recipe.id} result`);
    for (const key of recipe.ingredientKeys) if (!keys.has(key)) problems.push(`recipe ${recipe.id} ingredient ${key}`);
  }
  for (const table of data.loot) for (const drop of table.drops) if (!keys.has(drop.key)) problems.push(`loot ${table.id} ${drop.key}`);
  return problems;
}

export function writeVersion(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.next`, JSON.stringify(data));
  fs.renameSync(`${file}.next`, file);
}
