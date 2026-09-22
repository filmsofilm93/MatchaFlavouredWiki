import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { recipeSemanticSha1 } from "../scripts/recipe-fingerprint.mjs";
import { findWithheldData } from "../scripts/update-matcha.mjs";

const projectRoot = new URL("../", import.meta.url);

test("recipe comparison ignores presentation-only and ordering differences", () => {
  const vanilla = {
    type: "minecraft:crafting_shapeless",
    category: "misc",
    group: "test",
    ingredients: ["minecraft:stick", "minecraft:flint"],
    result: { id: "minecraft:arrow", count: 1 },
  };
  const copied = {
    result: { count: 1, id: "minecraft:arrow" },
    ingredients: ["minecraft:flint", "minecraft:stick"],
    type: "minecraft:crafting_shapeless",
  };
  const changed = { ...copied, result: { id: "minecraft:arrow", count: 2 } };

  assert.equal(recipeSemanticSha1(vanilla), recipeSemanticSha1(copied));
  assert.notEqual(recipeSemanticSha1(vanilla), recipeSemanticSha1(changed));
});

test("the withheld-data guard catches redacted records", () => {
  const ok = {
    recipes: [{ id: "a", station: "crafting", ingredients: [{ keys: ["x"] }] }],
    items: [{ key: "x", name: "X" }],
    fish: [],
  };
  assert.equal(findWithheldData(ok), null);
  assert.match(
    findWithheldData({
      ...ok,
      recipes: [{ ...ok.recipes[0], secret: true }],
    }),
    /recipe a/,
  );
  assert.match(
    findWithheldData({
      ...ok,
      recipes: [{ ...ok.recipes[0], ingredients: [] }],
    }),
    /recipe a/,
  );
  assert.match(
    findWithheldData({
      ...ok,
      items: [{ key: "x", name: "X", obscured: true }],
    }),
    /item x/,
  );
});

test("builds a GitHub Pages-ready static site", async () => {
  const html = await readFile(
    new URL("../dist/index.html", import.meta.url),
    "utf8",
  );

  assert.match(html, /Matcha Flavoured Wiki/i);
  assert.match(html, /id="root"/);
  assert.match(html, /\/MatchaFlavouredWiki\/assets\//);
  assert.doesNotMatch(html, /dist\/server|_next\//);

  await Promise.all([
    access(new URL("../dist/matcha/pack.png", import.meta.url)),
    access(
      new URL(
        "../dist/minecraft/assets/minecraft/textures/gui/container/crafting_table.png",
        import.meta.url,
      ),
    ),
  ]);
});

test("generated data is complete, with changelogs and texture links", async () => {
  const raw = await readFile(
    new URL("../app/data/wiki-data.json", import.meta.url),
    "utf8",
  );
  const data = JSON.parse(raw);

  assert.equal(data.recipes.length, data.stats.recipeCount);
  assert.ok(data.recipes.length >= 1000);
  assert.equal(data.items.length, data.stats.itemCount);
  assert.ok(data.items.length >= 900);
  assert.ok(data.release.versionId);
  assert.ok(data.release.sha1);
  assert.ok(data.release.changelog.length > 0);
  assert.ok(
    data.release.changelog.every(
      (entry) => entry.versionId && Array.isArray(entry.blocks),
    ),
  );
  assert.ok(data.items.every((item) => item.texture));
  assert.equal(
    data.items.find((item) => item.key.endsWith(":amber"))?.name,
    "Amber",
  );
  assert.equal(
    data.items.find((item) => item.key.endsWith(":opal"))?.name,
    "Opal",
  );
  assert.equal(
    data.items.find((item) => item.key.endsWith(":cheerful_clay_statue"))?.name,
    "Clay Fetish",
  );
  assert.ok(Number.isInteger(data.stats.untexturedItemCount));
  assert.equal(
    data.items.filter((item) => item.textureMissing).length,
    data.stats.untexturedItemCount,
  );
  assert.ok(data.stats.excludedVanillaRecipeCount > 0);
  assert.ok(data.progressionRules);
  assert.ok(data.progressionRules.deathHeartLoss > 0);
  assert.ok(
    data.progressionRules.startingMinimumHearts >=
      data.progressionRules.lowestMinimumHearts,
  );
  assert.ok(
    data.progressionRules.maximumHearts >
      data.progressionRules.startingMinimumHearts,
  );
  assert.ok(data.progressionRules.milestones.length >= 5);
  assert.equal(data.locations.length, data.stats.locationCount);
  assert.ok(data.locations.length >= 10);
  assert.ok(
    data.locations.every(
      (location) =>
        location.markerKey &&
        location.facts.length >= 2 &&
        location.sections.length >= 1 &&
        data.items.some((item) => item.key === location.markerKey) &&
        location.itemKeys.every((key) =>
          data.items.some((item) => item.key === key),
        ),
    ),
  );
  assert.equal(
    data.locations.find((location) => location.id === "frozen-waters").metric,
    "½ heart · 5 seconds",
  );
  assert.equal(
    data.locations.find((location) => location.id === "beta-villages").metric,
    "5 rebuilt climate variants",
  );
  for (const locationId of [
    "abbey",
    "papal-outposts",
    "overworld-surface",
    "resource-routes",
  ]) {
    assert.ok(data.locations.some((location) => location.id === locationId));
  }
  assert.ok(
    data.locations.every(
      (location) =>
        !/biome files|table revised|spacing 80|separation 50/i.test(
          JSON.stringify(location),
        ),
    ),
  );
  assert.ok(
    data.recipes.every((recipe) =>
      data.items.some((item) => item.key === recipe.result.key),
    ),
  );
  assert.ok(
    data.recipes.every((recipe) =>
      ["added", "changed"].includes(recipe.changeKind),
    ),
  );
  assert.equal(
    data.recipes.some((recipe) => recipe.id === "main:crafting/redstone_block"),
    false,
  );
  assert.equal(
    data.recipes.find(
      (recipe) => recipe.id === "main:crafting/acacia_planks_from_acacia_slabs",
    )?.changeKind,
    "added",
  );
  assert.equal(
    data.recipes.find((recipe) => recipe.id === "main:crafting/arrow")
      ?.changeKind,
    "changed",
  );
  assert.ok(
    data.recipes
      .flatMap((recipe) => recipe.ingredients)
      .every(
        (ingredient) =>
          (ingredient.keys.length > 0 || ingredient.unresolved === true) &&
          ingredient.keys.every((key) =>
            data.items.some((item) => item.key === key),
          ),
      ),
  );

  const stonecutterFamilies = new Set(
    data.recipes
      .filter((recipe) => recipe.station === "stonecutting")
      .map((recipe) => recipe.family),
  );
  assert.ok(stonecutterFamilies.size < 40);
  assert.ok(stonecutterFamilies.has("Acacia wood"));
  assert.ok(stonecutterFamilies.has("Copper family"));
  assert.ok(
    [...stonecutterFamilies].every(
      (family) => !/ or |stripped .* family/i.test(family),
    ),
  );

  // Nothing is withheld: spoilers are a display concern only.
  assert.equal(findWithheldData(data), null);
  assert.ok(
    data.recipes.every(
      (recipe) =>
        !("secret" in recipe) &&
        !("reviewPending" in recipe) &&
        recipe.ingredients.length > 0,
    ),
  );
  assert.ok(
    data.recipes
      .filter((recipe) => recipe.type.includes("crafting"))
      .every((recipe) => recipe.grid.length === 9),
  );
  for (const id of [
    "main:food/crafting/chorus_mochi",
    "main:food/crafting/gnocchi",
    "main:food/crafting/puerquito",
    "main:food/crafting/pupusa",
    "main:food/crafting/sweet_berry_toast",
    "main:food/crafting/warped_stroganoff",
  ]) {
    const recipe = data.recipes.find((entry) => entry.id === id);
    assert.ok(recipe, `${id} is published`);
    assert.ok(recipe.ingredients.length > 0, `${id} lists its ingredients`);
  }
  assert.equal(data.stats.recipeCount, data.recipes.length);
  assert.ok(data.advancements.some((entry) => entry.hidden === true));
  assert.equal(
    data.advancements.filter((entry) => entry.hidden).length,
    data.stats.hiddenAdvancementCount,
  );
  assert.ok(
    data.items.every((item) => !("obscured" in item) && !("sga" in item)),
  );
  assert.ok(data.fish.every((entry) => !("obscured" in entry)));
  assert.ok(data.fish.filter((entry) => entry.stars >= 3).length >= 20);
  const rareFishNames = data.fish
    .filter((entry) => entry.stars >= 3)
    .map(
      (entry) => data.items.find((item) => item.key === entry.itemKey)?.name,
    );
  assert.ok(
    rareFishNames.every((name) => name && !/^(Rare|Epic) Fish$/.test(name)),
  );
  assert.doesNotMatch(
    raw,
    /enchanting-table script|withheld|leaves that discovery sealed/i,
  );
});

test("spoilers.json flags every entry with a reason and a safe hint", async () => {
  const [data, spoilers] = await Promise.all(
    ["../app/data/wiki-data.json", "../app/data/spoilers.json"].map(
      async (file) =>
        JSON.parse(await readFile(new URL(file, import.meta.url), "utf8")),
    ),
  );
  const entries = spoilers.entries;
  for (const key of [
    ...data.items.map((item) => `item:${item.key}`),
    ...data.recipes.map((recipe) => `recipe:${recipe.id}`),
    ...data.advancements.map((entry) => `advancement:${entry.id}`),
  ]) {
    assert.ok(entries[key], `${key} has a spoiler flag`);
    assert.equal(typeof entries[key].spoiler, "boolean");
    assert.ok(entries[key].reason, `${key} has a reason`);
  }
  const flagged = Object.entries(entries).filter(([, entry]) => entry.spoiler);
  assert.ok(flagged.length > 100);
  assert.ok(flagged.every(([, entry]) => entry.hint && entry.reason));
  for (const entry of data.advancements.filter((adv) => adv.hidden)) {
    assert.equal(entries[`advancement:${entry.id}`].spoiler, true);
  }
  const spoilerNames = new Set(
    flagged
      .map(([key]) =>
        key.startsWith("item:")
          ? data.items.find((item) => item.key === key.slice(5))?.name
          : key.startsWith("advancement:")
            ? data.advancements.find((adv) => adv.id === key.slice(12))?.title
            : null,
      )
      .filter((name) => name && name.length > 2)
      .map((name) => name.toLowerCase()),
  );
  for (const [key, entry] of flagged) {
    for (const name of spoilerNames) {
      assert.ok(
        !entry.hint.toLowerCase().includes(name),
        `hint for ${key} names the spoiler "${name}"`,
      );
    }
  }
});

test("source keeps the recipe UX, exact slots, and low-compute deployment", async () => {
  const [packageJson, wikiApp, globalCss, updater, devUpdater, workflow] =
    await Promise.all([
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(
        new URL("../app/components/WikiApp.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(
        new URL("../scripts/update-matcha.mjs", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../scripts/dev-with-updates.mjs", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../.github/workflows/pages.yml", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(wikiApp, /label="RECOMMENDATION"/);
  assert.match(wikiApp, /Recommended Setup/);
  assert.match(wikiApp, /label: "The Nether"/);
  assert.match(wikiApp, /recipe-catalogue/);
  assert.match(wikiApp, /Find a recipe in this station/);
  assert.match(wikiApp, /Only recipes added or changed by Matcha live here/);
  assert.match(wikiApp, /Changed by Matcha/);
  assert.match(wikiApp, /function ChangelogPage/);
  assert.match(wikiApp, /function PlacesPage/);
  assert.match(wikiApp, /function PlacePage/);
  assert.match(wikiApp, /Read the full field entry/);
  assert.match(wikiApp, /What changes when you get there/);
  assert.match(wikiApp, /No registry soup/);
  assert.match(wikiApp, /What a death actually changes/);
  assert.match(wikiApp, /route: "places"/);
  assert.match(wikiApp, /import\.meta\.env\.BASE_URL/);
  assert.match(wikiApp, /ATTRIBUTIONS\.md/);
  assert.doesNotMatch(wikiApp, /recipe-selection/);

  assert.match(updater, /include_changelog=true/);
  assert.match(updater, /failed its SHA-1 check/);
  assert.match(updater, /findWithheldData/);
  assert.doesNotMatch(
    updater,
    /recipe-visibility|recipeContentSha1|ensureVisibilityManifest/,
  );
  assert.match(updater, /Location item link was not generated/);
  assert.match(updater, /check-exit-code/);
  assert.match(devUpdater, /MATCHA_UPDATE_INTERVAL_MINUTES/);
  assert.match(packageJson, /scripts\/dev-with-updates\.mjs/);

  assert.match(globalCss, /\.mc-stonecutting \.mc-output[\s\S]*left: 286px/);
  assert.match(globalCss, /\.mc-smithing \.mc-output[\s\S]*left: 196px/);
  assert.match(globalCss, /\.portal-card small[\s\S]*min-height: 2\.9em/);
  assert.match(globalCss, /\.place-card-grid/);

  assert.match(workflow, /cron: "17 6,18 \* \* \*"/);
  assert.match(workflow, /steps\.gate\.outputs\.publish == 'true'/);
  assert.match(workflow, /actions\/deploy-pages@v4/);

  await assert.rejects(access(new URL("app/_sites-preview", projectRoot)));
  for (const removed of [
    "app/data/recipe-visibility.json",
    "app/data/recipe-review.json",
    "scripts/apply-recipe-review.mjs",
  ]) {
    await assert.rejects(access(new URL(removed, projectRoot)));
  }
  assert.doesNotMatch(workflow, /protected recipe/i);
  assert.match(workflow, /findWithheldData/);
});
