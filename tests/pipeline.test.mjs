// Unit tests for the data pipeline's building blocks.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import { checkForDrops } from "../scripts/pipeline/build.mjs";
import { regenerationHealing } from "../scripts/pipeline/items.mjs";
import { atLeastOnce, Loot } from "../scripts/pipeline/loot.mjs";
import { parseComponent } from "../scripts/pipeline/mechanics.mjs";
import { readNbt } from "../scripts/pipeline/nbt.mjs";
import { compileFilter, Resources } from "../scripts/pipeline/resources.mjs";
import { numberRange } from "../scripts/pipeline/util.mjs";
import { recipeSemanticSha1 } from "../scripts/recipe-fingerprint.mjs";
import { findWithheldData } from "../scripts/update-matcha.mjs";

test("recipe comparison ignores presentation-only and ordering differences", () => {
  const vanilla = { type: "minecraft:crafting_shapeless", category: "misc", ingredients: ["minecraft:a", "minecraft:b"], result: { id: "minecraft:c", count: 1 } };
  const copied = { type: "minecraft:crafting_shapeless", category: "building", group: "x", ingredients: ["minecraft:b", "minecraft:a"], result: { id: "minecraft:c" } };
  assert.equal(recipeSemanticSha1(vanilla), recipeSemanticSha1(copied));
});

test("regeneration healing matches Minecraft's tick rate", () => {
  // Regeneration I heals every 50 ticks, II every 25, III every 12.
  assert.equal(regenerationHealing(0, 600), 12);
  assert.equal(regenerationHealing(1, 100), 4);
  assert.equal(regenerationHealing(2, 240), 20); // Tonkotsu Ramen: 10 hearts
});

test("number providers and at-least-once chances", () => {
  assert.deepEqual(numberRange({ min: 2, max: 4 }), { min: 2, max: 4, mean: 3 });
  assert.equal(numberRange({ type: "minecraft:constant", value: 5 }).mean, 5);
  assert.equal(numberRange(undefined, 1).min, 1);
  assert.equal(atLeastOnce(0.5, { min: 1, max: 1 }), 0.5);
  assert.equal(atLeastOnce(0.5, { min: 2, max: 2 }), 0.75);
  // Uniform 1-2 rolls: average of 0.5 and 0.75.
  assert.ok(Math.abs(atLeastOnce(0.5, { min: 1, max: 2 }) - 0.625) < 1e-9);
});

function tempPack(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mf-test-"));
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, ...file.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof content === "string" ? content : JSON.stringify(content));
  }
  return root;
}

test("pack files override vanilla, tags merge, and pack.mcmeta filters hide vanilla files", () => {
  const pack = tempPack({
    "data/minecraft/recipe/stick.json": { type: "pack" },
    "data/minecraft/tags/item/planks.json": { values: ["minecraft:bamboo_planks"] },
    "data/minecraft/tags/item/logs.json": { replace: true, values: ["minecraft:oak_log"] },
  });
  const vanilla = tempPack({
    "data/minecraft/recipe/stick.json": { type: "vanilla" },
    "data/minecraft/recipe/mace.json": { type: "vanilla" },
    "data/minecraft/advancement/story/root.json": {},
    "data/minecraft/tags/item/planks.json": { values: ["minecraft:oak_planks"] },
    "data/minecraft/tags/item/logs.json": { values: ["minecraft:birch_log"] },
  });
  const filter = compileFilter({ filter: { block: [{ namespace: "minecraft", path: "recipe/mace.json" }, { namespace: "minecraft", path: "advancement/story" }] } });
  const resources = new Resources([
    { name: "pack", dataRoot: path.join(pack, "data"), assetsRoot: path.join(pack, "assets"), filter },
    { name: "vanilla", dataRoot: path.join(vanilla, "data"), assetsRoot: path.join(vanilla, "assets") },
  ]);
  assert.equal(resources.json("recipe", "minecraft:stick").type, "pack");
  assert.equal(resources.json("recipe", "minecraft:mace"), null, "blocked by the filter");
  assert.equal(resources.list("advancement").size, 0, "path regex blocks the whole folder");
  assert.deepEqual(resources.tag("item", "minecraft:planks").sort(), ["minecraft:bamboo_planks", "minecraft:oak_planks"]);
  assert.deepEqual(resources.tag("item", "minecraft:logs"), ["minecraft:oak_log"], "replace: true drops vanilla values");
  assert.equal(resources.list("recipe", { unfiltered: true, layer: resources.layers[1] }).size, 2);
});

test("loot chances follow weights, rolls, nested tables and random_chance", () => {
  const pack = tempPack({
    "data/test/loot_table/chest.json": {
      pools: [
        { rolls: 1, entries: [{ type: "minecraft:item", name: "minecraft:diamond", weight: 1 }, { type: "minecraft:item", name: "minecraft:stick", weight: 3, functions: [{ function: "minecraft:set_count", count: { min: 2, max: 5 } }] }] },
        { rolls: 2, entries: [{ type: "minecraft:loot_table", value: "test:inner" }] },
        { rolls: 1, conditions: [{ condition: "minecraft:random_chance", chance: 0.5 }], entries: [{ type: "minecraft:item", name: "minecraft:emerald" }] },
      ],
    },
    "data/test/loot_table/inner.json": { pools: [{ rolls: 1, entries: [{ type: "minecraft:item", name: "minecraft:apple" }, { type: "minecraft:empty" }] }] },
  });
  const resources = new Resources([{ name: "pack", dataRoot: path.join(pack, "data"), assetsRoot: path.join(pack, "assets") }]);
  const items = { define: (id) => id, plain: (id) => id, get: () => null };
  const text = { enchantmentName: (id) => id, biomeName: (id) => id, entityName: (id) => id, nameFor: () => null };
  const loot = new Loot({ resources, text, items });
  const table = loot.publish("test:chest");
  const chance = (key) => table.drops.find((drop) => drop.key === key)?.chance;
  assert.equal(chance("minecraft:diamond"), 0.25);
  assert.equal(chance("minecraft:stick"), 0.75);
  assert.deepEqual([table.drops.find((d) => d.key === "minecraft:stick").min, table.drops.find((d) => d.key === "minecraft:stick").max], [2, 5]);
  assert.equal(chance("minecraft:apple"), 0.75, "nested table rolled twice at 50%");
  assert.equal(chance("minecraft:emerald"), 0.5);
  assert.deepEqual(table.includes, ["test:inner"]);
});

test("NBT reader handles gzip compounds, lists and arrays", () => {
  const parts = [];
  const u8 = (v) => parts.push(Buffer.from([v]));
  const str = (s) => { const b = Buffer.from(s, "utf8"); const h = Buffer.alloc(2); h.writeUInt16BE(b.length); parts.push(h, b); };
  const i32 = (v) => { const b = Buffer.alloc(4); b.writeInt32BE(v); parts.push(b); };
  u8(10); str("");
  u8(8); str("LootTable"); str("minecraft:chests/test");
  u8(9); str("pos"); u8(3); i32(3); i32(1); i32(2); i32(3);
  u8(11); str("ints"); i32(2); i32(7); i32(-1);
  u8(0);
  const nbt = readNbt(zlib.gzipSync(Buffer.concat(parts)));
  assert.deepEqual(nbt, { LootTable: "minecraft:chests/test", pos: [1, 2, 3], ints: [7, -1] });
});

test("text components parse from JSON and SNBT", () => {
  assert.deepEqual(parseComponent('{"translate":"a.b","color":"gray"}'), { translate: "a.b", color: "gray" });
  assert.deepEqual(parseComponent("{text:'Hello',bold:true,color:red}"), { text: "Hello", bold: true, color: "red" });
});

test("the drop guard fails loudly when a category collapses", () => {
  const stats = { packRecipes: 1000, advancements: 150, customItems: 400, packLootTables: 300, trades: 280, fish: 40, ores: 40, packStructures: 7, enchantments: 30 };
  const good = { schema: 2, stats, mechanics: { progression: {} } };
  assert.deepEqual(checkForDrops(good, good), []);
  const bad = { schema: 2, stats: { ...stats, fish: 0, packRecipes: 500 }, mechanics: { progression: null } };
  const problems = checkForDrops(bad, good).join("\n");
  assert.match(problems, /fish: none found/);
  assert.match(problems, /pack recipes: 1000 -> 500/);
  assert.match(problems, /death system rules: none found/);
});

test("the withheld-data guard catches redacted records", () => {
  const ok = { recipes: [{ id: "a", ingredientKeys: ["x"] }], items: [{ key: "x", name: "X" }], fish: [] };
  assert.equal(findWithheldData(ok), null);
  assert.match(findWithheldData({ ...ok, recipes: [{ id: "a", ingredientKeys: [] }] }), /recipe a/);
  assert.match(findWithheldData({ ...ok, items: [{ key: "x", name: "X", obscured: true }] }), /item x/);
  assert.match(findWithheldData({ ...ok, fish: [{ key: "f", obscured: true }] }), /fish f/);
});
