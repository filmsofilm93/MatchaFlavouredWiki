# Matcha Flavoured fan wiki: Phase 1 report

Branch `phase-1-pipeline`, 2 commits on top of Evansch0/MatchaFlavouredWiki `aaa664f`. Nothing has been pushed yet (see decision 3).

## 1. Base repo checks

| Step             | Base repo as cloned                                                                                                                           | After my changes                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `npm install`    | OK, 0 vulnerabilities                                                                                                                         | same                                                                    |
| `npm run update` | **Failed here**: `api.modrinth.com` returned 403. This sandbox can't reach Modrinth or Mojang (`piston-meta`). GitHub Actions can reach both. | Same limit. I added `scripts/build-from-github.mjs` as an offline path. |
| `npm run lint`   | Pass                                                                                                                                          | Pass                                                                    |
| `npm test`       | 4/4 pass                                                                                                                                      | 6/6 pass (tests rewritten and extended)                                 |

**How I checked the data without Modrinth.** Commit `027108ab` of the official GitHub repo (Sep 1, `Matcha_Flavoured/` layout) rebuilds the committed Modrinth 1.12.1-alpha snapshot exactly: 1,133/1,133 recipes, 77/77 advancements, 0 field differences. That commit is the baseline for everything below. The committed `wiki-data.json` is now built from it, with the real Modrinth release metadata kept.

## 2. Recipe hiding replaced

I found five separate places where the base repo withheld data:

1. **Recipe manifests.** `recipe-visibility.json` and `recipe-review.json` blanked ingredients on 324 changed recipes plus the secret ones. Both files are deleted, along with `apply-recipe-review.mjs`.
2. **Hidden advancements.** The generator dropped all 107 of them. They're now published with `hidden: true`.
3. **Fish names.** Rare and Epic fish were renamed "Rare Fish" / "Epic Fish" and stored in enchanting-table script (`obscured`, `sga`). Their real names are now published.
4. **Untextured items.** 20 recipes and 14 items were dropped because their items had no texture. They're now published with a placeholder texture and `textureMissing: true`.
5. **Hand-written text.** Location text said things like "this notebook ran out of ink". It now states what the data says (for example, Mineshaft chests can hold the Gnocchi recipe note).

Guard: `findWithheldData()` fails the updater, the CI step ("Verify nothing is withheld"), and the tests if any record comes back redacted. The six hard-coded "secret" recipe IDs were dead code: they never matched the real IDs (`main:food/crafting/...`). The tests now check those six recipes by their real IDs.

## 3. Data coverage (1.12.1-alpha)

| Kind                                        | In the pack                                                                  | In generated data now   | Notes                                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| Recipes                                     | 1,162 files                                                                  | **1,153**               | 9 unchanged vanilla copies are excluded on purpose. Was 1,133 before.                         |
| Advancements, displayed                     | 184 (107 hidden)                                                             | **184** (107 hidden)    | Was 77                                                                                        |
| Advancements, no display (recipe unlockers) | 237                                                                          | **245** `recipeUnlocks` | New. Includes the matcha/ and endless_repairs/ namespaces.                                    |
| Items                                       | –                                                                            | **1,245**               | 261 defined by an item model, 105 renamed vanilla items, 879 vanilla. 19 use the placeholder. |
| Villager trades                             | 285 files + 68 trade sets                                                    | 37                      | Only fisherman trades are read, and only for the fish list                                    |
| Loot tables                                 | 333                                                                          | **0 as data**           | Only ~12 hand-picked lookups feed location text                                               |
| Worldgen                                    | 9 placed + 3 configured features, 65 biomes, 7 structures, 14 template pools | **0**                   |                                                                                               |
| Functions                                   | 277 `.mcfunction`                                                            | ~10 regex reads         | Heart numbers only                                                                            |
| Structure `.nbt`                            | 43                                                                           | 0                       |                                                                                               |
| Hand-written "locations"                    | –                                                                            | 14                      | Editorial prose, not generated                                                                |

## 4. Generated data schema (`app/data/wiki-data.json`)

```
release        { version, name, minecraft, published, modrinthUrl, downloadUrl, sha1, versionId,
                 highlights[], changelog[{versionId, version, name, published, minecraft[], channel,
                 featured, blocks[{type, text}]}], changelogHash, checkedAt }
stats          { recipeCount, craftingCount, itemCount, advancementCount, hiddenAdvancementCount,
                 recipeUnlockCount, locationCount, textureCount, excludedVanillaRecipeCount,
                 untexturedItemCount, stationCounts{} }
stations[7]    { id, label, texture, count }
recipes[1153]  { id, slug, name, namespace, path, type, station, stationLabel, stationTexture, category,
                 family, changeKind(added|changed), result{key, count}, ingredientKeys[],
                 ingredients[{keys[], label, tag, unresolved?}], grid[9], cookingTime, experience,
                 unlockedBy[] }                                                  ← unlockedBy is new
items[1245]    { key(=item_model), id(base item), model, name, texture, textureMissing, color, lore[],
                 effects[{name, level, seconds}], properties[string], outputOf[], usedIn[], rarity }
advancements[184] { id, section, title, description, frame, hidden, showToast, announceToChat, iconKey,
                 parent, criteria[{name, trigger, items?, models?, recipe?, entity?, dimension?}],
                 requirements[][], rewards{recipes[], loot[], experience, function}, sourceFile }  ← new fields
recipeUnlocks[245] { id, parent, criteria[], requirements[], rewards{}, sourceFile }             ← new
fish[37]       { itemKey, tier, stars, saleCount }
locations[14]  { id, group, name, kicker, summary, metric, findings[], facts[], sections[], markerKey,
                 itemKeys[], tone, sourceCount }
progressionRules { deathHeartLoss, startingMinimumHearts, lowestMinimumHearts, easyMinimumHearts,
                 maximumHearts, crystalHeartGain, hardDifficultyAtMinimum, milestones[] }
```

Station mapping (from the pack's lang file): smelting → **Oven**, smoking → **Mud Kiln**, campfire_cooking → Campfire (the pack's lang calls the block **Kindling**), plus blasting, smithing, stonecutting, and crafting. "Chemistry Stand" has 0 recipes.

## 5. Spot checks against the official repo

`scripts/audit-pipeline.mjs` re-reads the raw JSON with a separate parser, so it doesn't reuse the generator's code.

- **Recipes: 24/24 sampled match.** The sample covers all 7 stations, alloys (Electrum, Hepatizon ← `bronze_alloy`), smithing (Adamant Claymore), the Mud Kiln and Oven, and the Gnocchi and Chorus Mochi recipes. It compares result ID and count, item model, every ingredient, the station, and cook time.
- **Full sweep: 1,132/1,153 recipes match.** The 21 mismatches come from one modelling bug (gap G6): items are keyed by `item_model`. When the same model sits on two base items, the first one wins. Examples: Ramen is made on `poisonous_potato` at the campfire but on `rabbit_stew` at the oven, and Silver Sword was stored as `glistering_melon_slice`.
- **Advancements: 12/12 sampled match** on title, frame, hidden flag, and parent. The sample is 8 visible, 4 hidden, and the tabs End, Hell, Tutorial, and Angler's Almanac. Criteria and rewards are now extracted too.

**Base-pipeline bugs I fixed along the way:**

- Tag ingredients used a hand-written fallback list, so "Any Planks" meant oak only. Vanilla tags are now read, which corrected 156 recipes.
- Vanilla item names were guessed from the ID. The vanilla lang file is now read.
- Hidden advancements, rare fish, and untextured items were dropped (see section 2).

## 6. Gaps

**Critical**

- **G1. The pipeline is tied to the 1.12.1 file layout.** Apart from recipes and advancements, which I've already made namespace-agnostic, it hard-codes `data/main/...` paths and specific files. On GitHub `main` (1.12.2 dev, where almost everything moved to the `matcha:` namespace), a dry run gives 1,145 recipes and 176 advancements, but **0 fish, no death-system rules, and 2 location pages missing**. It still passes validation. The next Modrinth release would degrade the site silently. Fix planned for Phase 3: find everything by type across all namespaces, and fail loudly on big drops.
- **G2. The repo ships Mojang assets.** `public/minecraft` is 69 MB of vanilla client assets, including all 558 GUI textures and the font files, merged with the pack. Your brief rules out copying vanilla GUI textures and fonts. See decision 2.

**Missing extraction (needed for the Phase 3 features)**

- **G3. Loot tables:** none of the 333 are extracted as data. Also missing: drop chances and weights, `rolls`, conditions (tool, enchantment, `random_chance`), and nested tables. Unchanged vanilla tables such as ordinary mob drops need vanilla data, which isn't downloaded yet.
- **G4. Trades:** all professions and levels, the wandering trader (28 files: maps, discs, the Asylum Seeker / Refugee Application), and Obol prices. Obol is the renamed emerald.
- **G5. World generation:** the pack mostly reuses vanilla ores under new names. Emerald ore → **Native Silver**, lapis ore → **Quartz Deposit**, nether quartz ore → **Sulfurous Hellstone**. It overrides only 6 placed features (deep large coal, deep and mountain emerald/silver, and so on) plus the biome feature lists. To get Y-ranges and vein sizes for copper, sulfur, and the rest, I need vanilla `placed_feature` / `configured_feature` data. I'll add that the same way vanilla recipes are added now.
- **G6. Item model:**
  - Items are keyed by model, which loses per-recipe base items (21 recipes).
  - Not extracted: `minecraft:food` (nutrition, saturation), `use_remainder`, and consume time.
  - Healing is Regeneration plus ❤ glyphs in the lore. The glyphs are captured only as raw text.
  - Effect names are guessed from the ID instead of taken from lang.
  - Enchantments and attributes are flattened into strings.
  - `rarity` is set only for fish.
  - The pack's custom enchantments (27 in `main/enchantment`, including warding0–3, anemos, bloodrage, and divinity) aren't extracted.
- **G7. Intrinsics and blessings:** intrinsics are implemented as enchantments, functions (`mechanic/intrinsic_enchants`), and lore. Nothing is structured yet. The 24 blessing recipes are extracted, but the enchantments each one grants are not.
- **G8. Recipe unlocks:**
  - The pack's unlock advancements have no display and are triggered by picking up items.
  - **631 of 1,153 recipes have no unlock advancement at all.** They can still be crafted; they just never appear in the recipe book automatically.
  - "Recipes this advancement unlocks" therefore has to be derived from shared trigger items. Nothing grants recipes directly.
- **G9. Functions and mechanics:** the death system, keep-inventory, Easy/Normal/Hard, warding, hunger, darkness, freezing water, and safe-surface spawning aren't extracted. Only heart numbers are read.
  - Scripted item sources need care: `update_old_items/*` and `remove_vanilla_items/*` hand out treasures, but they are **item-migration** functions, not ways to obtain items.
- **G10. Structures:** the 43 `.nbt` files (Abbey, outpost, villages) aren't parsed. The Abbey recipe the base wiki mentions is not in any loot table, so it's probably placed in a structure file. Marked **needs verification**.
- **G11. Hand-written location pages:** the 14 entries aren't generated. Phase 3 replaces them with generated structure, loot, and ore pages. Any claim I can't parse will be marked "needs verification".
- **G12. Text glyphs:** 47 advancement texts and 36 item lores contain private-use font glyphs (the pack's custom icons, e.g. ``). The UI needs to map or strip them.
- **G13. Leftovers and unresolved data:**
  - 19 poplar items and 17 recipes use `#minecraft:poplar_logs`, a tag that exists in neither the pack nor 26.2. Probably unfinished content; flagged "needs verification".
  - The `with_songs` advancement tab is a leftover the creator says to ignore.
- **G14. Version history:**
  - Only the current release's data is kept. Each version's summary is already stored (14 Modrinth changelogs, 0.2 → 1.12.1-alpha).
  - Per-version data would come from past Modrinth zips in CI, or from GitHub history.
  - The repo's `changelog.md` covers only the dev cycle in progress.

## 7. Draft `spoilers.json`: 383 of 2,968 entries flagged

| Kind         | Flagged / total | Main reasons                                                                                                                                                                                                                                                                                 |
| ------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advancements | 121 / 184       | 107 hidden, 8 Nether tab, 5 End tab, 4 after the Nether/stronghold steps (reasons overlap)                                                                                                                                                                                                   |
| Items        | 104 / 1,245     | 20 rare/epic fish, 19 no texture (unclear), 16 Adamant (the pack renames Netherite gear to Adamant), 13 Electrum, 11 rare treasures (books, gems, Crystal Heart, Divine Fragment), 4 secret ingredients + 11 secret meals, 5 End materials, 3 elytra, 2 other Netherite, Gnocchi recipe note |
| Recipes      | 84 / 1,153      | 76 make a spoiler item, 34 use a spoiler ingredient, 11 secret meals, 3 debug (reasons overlap)                                                                                                                                                                                              |
| Loot tables  | 56 / 333        | 31 treasure tables, 39 that contain only spoiler items (overlap). Ordinary chest tables stay visible; only their spoiler entries hide.                                                                                                                                                       |
| Mechanics    | 15 / 39         | Village horror atmosphere (6), boss events, scripted item effects                                                                                                                                                                                                                            |
| Locations    | 3 / 14          | Village atmosphere, Bastions, End Cities                                                                                                                                                                                                                                                     |

- Every entry has `spoiler`, `reason`, and `hint`, one per line so the file is easy to edit by hand.
- Hints never name what they hide. A test checks every hint against all 192 spoiler names.
- **Your edits survive regeneration.** An entry is kept as you wrote it if you set `"manual": true`, or if its content no longer matches the signature written when it was generated. I tested both cases. Entries for IDs that disappear move to `orphans` rather than being deleted.
- Flags are regenerated by `npm run update` and by `build-from-github.mjs`.

## 8. Decisions I need from you

1. **Which pack version should the site track?** Modrinth 1.12.1-alpha is what players have. GitHub `main` is ahead (1.12.2 dev, with the namespace move).
   - My recommendation: default to the latest Modrinth release, and offer "GitHub main (unreleased)" as an extra entry in the version switcher.
2. **Vanilla textures.** Options:
   - (a) Ship only the pack's own textures plus vanilla **item and block** textures for vanilla ingredients. Drop the vanilla GUI and font files.
   - (b) Ship pack textures only, and draw original placeholders for vanilla items.
   - (c) Keep the base repo's approach.
   - My recommendation is (a); the whole UI chrome would be original pixel art.
3. **The fork.** I can't create a GitHub fork from this sandbox (no GitHub login). Two options:
   - Fork it yourself (one click) and give me a way to push, such as a fine-grained token scoped to that repo.
   - Or I hand you a git bundle to push.
4. **Spoiler policy calls where I followed "if unsure, mark it":**
   - The whole Nether tab is flagged.
   - Electrum gear is flagged, because it needs a Divine Fragment.
   - Rare and Epic fish are flagged.
   - Ordinary chest loot stays visible.

   Tell me if any of these should flip. Otherwise, edit `spoilers.json` later.

## 9. New and changed files

- `scripts/build-wiki-data.mjs`: withholding removed; criteria, rewards, and unlock links; vanilla tags and lang; placeholder textures
- `scripts/update-matcha.mjs`: review system removed; `findWithheldData`; spoiler refresh; vanilla tags extracted
- `scripts/build-from-github.mjs` (new): builds from the official repo at any commit; handles both repo layouts; vanilla data from Mojang or misode/mcmeta
- `scripts/audit-pipeline.mjs` (new): inventory, independent spot checks, and a full recipe sweep
- `scripts/build-spoilers.mjs` (new) → `app/data/spoilers.json`
- `.github/workflows/pages.yml`: "Verify protected recipes" replaced by "Verify nothing is withheld"
- `tests/rendered-html.test.mjs`: 6 tests covering nothing withheld, hidden advancements present, real fish names, spoiler coverage, hint safety, and the removed files staying gone
