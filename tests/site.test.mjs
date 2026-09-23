// Checks on the published data, the spoiler flags and the built site.
// Run after `npm run build:pages` (npm test does both).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { checkForDrops, danglingReferences } from "../scripts/pipeline/build.mjs";
import { findWithheldData } from "../scripts/update-matcha.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const index = read("public/data/versions.json");
const versions = index.versions.map((entry) => ({ entry, data: read(`public/${entry.file}`) }));
const spoilers = read("app/data/spoilers.json").entries;

test("the site defaults to the latest Modrinth release and offers GitHub main", () => {
  const def = index.versions.find((entry) => entry.id === index.default);
  assert.equal(def.kind, "release");
  assert.ok(index.versions.some((entry) => entry.kind === "github"), "GitHub main is in the switcher");
  assert.ok(index.changelog.length > 5, "Modrinth changelogs are published");
});

for (const { entry, data } of versions) {
  test(`${entry.label}: complete, nothing withheld, no dangling links`, () => {
    assert.equal(data.schema, 2);
    assert.deepEqual(checkForDrops(data, null), []);
    assert.equal(findWithheldData(data), null);
    assert.deepEqual(danglingReferences(data), []);
    assert.ok(data.stats.packRecipes >= 1000);
    assert.ok(data.advancements.some((adv) => adv.hidden), "hidden advancements are published");
    assert.ok(data.fish.length >= 30 && data.fish.every((fish) => !/^(Rare|Epic) Fish$/.test(data.items.find((item) => item.key === fish.key)?.name)), "real fish names");
    assert.ok(data.fish.some((fish) => fish.stars === 4), "the top tier is present");
    // Every published texture exists and only tex/ is used (no Minecraft GUI or font files).
    for (const item of data.items) {
      if (!item.texture) continue;
      assert.match(item.texture, /^tex\/[0-9a-f]{16}\.png$/);
      assert.ok(fs.existsSync(path.join(root, "public", item.texture)), `${item.key} texture exists`);
    }
    // Every recipe keeps its exact slots.
    for (const recipe of data.recipes) {
      if (recipe.grid) assert.equal(recipe.grid.length, 9, recipe.id);
      if (recipe.slots) assert.equal(recipe.slots.length, 3, recipe.id);
    }
    assert.ok(data.recipes.some((recipe) => recipe.kind === "smithing" && recipe.slots[0] === null), "templates stay empty when absent");
    assert.ok(data.loot.some((table) => table.drops.some((drop) => drop.chance < 1)), "drop chances are computed");
    assert.ok(data.structures.some((structure) => structure.byPack && structure.lootTables.length), "pack structures list their chests");
    assert.ok(data.worldgen.ores.some((ore) => ore.byPack), "pack ore changes are read");
    assert.ok(data.trades.professions.length >= 10);
    assert.ok(data.mechanics.progression?.maximumHearts > 0, "death system settings are read");
  });
}

test("spoilers.json covers every entry with a reason and a hint that names nothing it hides", () => {
  const { data } = versions.find(({ entry }) => entry.id === index.default);
  for (const key of [...data.items.map((item) => `item:${item.key}`), ...data.advancements.map((adv) => `advancement:${adv.id}`)]) {
    assert.ok(spoilers[key], `${key} has a flag`);
    assert.equal(typeof spoilers[key].spoiler, "boolean");
    assert.ok(spoilers[key].reason);
  }
  const flagged = Object.entries(spoilers).filter(([, entry]) => entry.spoiler);
  assert.ok(flagged.length > 100);
  assert.ok(flagged.every(([, entry]) => entry.hint && entry.reason));
  for (const adv of data.advancements.filter((entry) => entry.hidden)) assert.equal(spoilers[`advancement:${adv.id}`].spoiler, true, adv.id);
  // Rule: children of hidden advancements are spoilers.
  const byId = new Map(data.advancements.map((adv) => [adv.id, adv]));
  for (const adv of data.advancements) if (byId.get(adv.parent)?.hidden) assert.equal(spoilers[`advancement:${adv.id}`].spoiler, true, adv.id);
  const names = new Set(flagged.flatMap(([key]) => {
    const name = key.startsWith("item:") ? data.items.find((item) => `item:${item.key}` === key)?.name : key.startsWith("advancement:") ? byId.get(key.slice(12))?.title : null;
    return name && name.length > 2 ? [name.toLowerCase()] : [];
  }));
  for (const [key, entry] of flagged) {
    if (entry.manual) continue;
    const hint = entry.hint.toLowerCase();
    for (const name of names) assert.ok(!hint.includes(name), `${key} hint names "${name}"`);
  }
});

test("the built site is ready for GitHub Pages and ships no Minecraft GUI or font files", () => {
  const dist = path.join(root, "dist");
  const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  assert.match(html, /Matcha Flavoured Wiki/);
  assert.match(html, /id="root"/);
  assert.match(html, /\/MatchaFlavouredWiki\/assets\//);
  assert.ok(fs.existsSync(path.join(dist, "data", "versions.json")));
  const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const all = files(dist).map((file) => path.relative(dist, file).split(path.sep).join("/"));
  assert.ok(!all.some((file) => file.startsWith("minecraft/")), "no copied client assets");
  assert.ok(!all.some((file) => /textures\/gui|\/font\//.test(file)));
  const fonts = all.filter((file) => /\.(woff2?|ttf|otf)$/.test(file));
  assert.ok(fonts.length && fonts.every((file) => /Monocraft/.test(file)), "only the Monocraft font ships");
});

test("removed withholding files stay gone", () => {
  for (const file of ["app/data/recipe-visibility.json", "app/data/recipe-review.json", "scripts/apply-recipe-review.mjs", "public/minecraft", "app/data/wiki-data.json"]) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file);
  }
});
