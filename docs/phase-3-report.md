# Matcha Flavoured fan wiki: Phase 3 report

Branch `phase-3-site`, three commits on top of `phase-1-pipeline`:

1. `c318279` new data pipeline
2. `3167153` the full site
3. this report plus a small fix

Nothing is deployed yet; that is Phase 4.

## 1. What changed in the pack since Phase 1

- **Modrinth now has 1.12.2-beta (Sep 19)**, and it is uploaded as **two Modrinth versions** with the same version number: a data pack (`Matcha_DP_1_12_2_pre.zip`, loader `datapack`) and a resource pack (`Matcha_RP_…`, loader `minecraft`, named "See DP"). The old updater took the newest upload only, which is the resource pack, so its next run would have failed. The new updater groups uploads by version number and merges them.
- **Everything moved to the `matcha:` namespace** (G1). The old pipeline found no fish and no death-system rules on this layout; the new one finds both.
- **`pack.mcmeta` has a filter** that blocks 5 vanilla advancement tabs and 396 vanilla recipes. The pipeline now applies it the way Minecraft does, so blocked vanilla recipes are not listed.
- **The death system was reworked.** Minimum hearts are per player and depend on difficulty (Easy 10, Normal 6, Hard 3). Hard costs 2 hearts per death. Maximum is 30.

Per your decisions, the site defaults to the latest Modrinth release (1.12.2-beta). **GitHub main** (`5bf7c3e`, "unreleased") is the second entry in the version switcher.

## 2. Data pipeline (`scripts/pipeline/`)

| Module | What it reads |
|---|---|
| `sources` | Modrinth releases (grouped), the official GitHub repo (both layouts), Minecraft's client jar or misode/mcmeta |
| `resources` | Pack-over-vanilla view: overrides, tag merging (`replace`), `pack.mcmeta` filters; no namespace assumptions |
| `items` | Items keyed by `item_model` (else base ID); every inline definition merged; food, consumable, healing, effects, tool rules, attributes, enchantments, repair, rarity |
| `recipes` | All stations; exact 3×3 grids; smithing keeps template/base/addition slots (a missing template stays empty); pack vs unchanged vanilla |
| `advancements` | Tabs, criteria, rewards, recipe-book unlocks (derived from the display-less unlockers that fire on the same pickups) |
| `loot` | Every pool, entry, weight, condition and function; chance per open/kill/catch |
| `trades` | Data-driven villager and wandering-trader trades, all levels |
| `worldgen` | Ore veins: blocks, vein size, veins per chunk, height shape and range, biomes, pack changes |
| `structures` | Jigsaw pools + `.nbt` templates: loot containers, fixed items, vaults and keys, spawners |
| `enchantments` | Pack enchantments, including intrinsics |
| `mechanics` | Function digests: gamerules, effects, attributes, messages, scoreboards, death-system settings |
| `assets` | Only the textures items and glyphs use, content-addressed in `public/tex/` |

**Coverage, 1.12.2-beta:**
- **Recipes:** 1,145 pack recipes (plus 1,186 unchanged vanilla, shown separately; 9 identical vanilla copies excluded).
- **Items and advancements:** 1,928 items (495 custom), 176 advancements (105 hidden).
- **Loot and trades:** 737 loot tables (532 from the pack) and 289 trades.
- **World:** 47 fish, 42 ore features, and 35 structures (7 changed by the pack).
- **Also extracted:** 79 enchantments, and 276 functions digested.

**Guards:** the build fails if any category is empty or drops by more than 25% against the previous build (`--allow-drop` to override). It also fails on dangling item references and on withheld data.

### Gap status

| Gap | Status |
|---|---|
| G1 layout-bound pipeline | **Fixed.** Namespace-agnostic; fails loudly on drops |
| G2 Mojang assets | **Fixed.** `public/minecraft` (69 MB, incl. GUI textures and fonts) removed; 1,505 item/block textures (0.7 MB) ship |
| G3 loot tables | **Done** |
| G4 trades | **Done** (Obol is the renamed emerald) |
| G5 worldgen | **Done** for ores and pack-changed features |
| G6 item model | **Done.** Per-recipe base items, food, use remainder, consume time, lang effect names, structured enchantments and attributes |
| G7 intrinsics/blessings | **Partial.** Intrinsics listed on Gear and item pages; blessing recipes shown; the enchantment each blessing grants is only shown where the item carries it |
| G8 recipe unlocks | **Done.** 612 pack recipes never enter the recipe book automatically |
| G9 mechanics | **Partial by design.** Facts from commands only, no prose |
| G10 structures | **Done.** e.g. the Abbey: 3 loot tables, 2 vault types, 27 spawners, fixed items |
| G11 hand-written locations | **Replaced** by generated structure, ore and loot pages |
| G12 glyphs | **Done.** Private-use icons render from the pack's font sheet |
| G13 poplar tag | No unresolved tags remain in 1.12.2 |
| G14 version history | Latest release + GitHub main, per your decision; all Modrinth changelogs shown |

## 3. Verification

- **Regression against Phase 1.** Rebuilding 1.12.1 (commit `027108ab`) with the new pipeline reproduces **all 1,153 recipes and 184 advancements, with 0 field differences** (result, count, every slot, station, cook time; title, frame, hidden flag, parent).
- **Independent audit** (`npm run audit`, its own parser). **No differences** in 450 records on 1.12.2-beta and 240 on GitHub main (recipes slot by slot, advancements, loot pool weights).
- **Tests:** 15/15 (pipeline units: chances, NBT, filters, tags, SNBT, guards; data and spoiler checks; built-site checks, including that no Minecraft GUI or font files ship). Lint clean.

Bugs this turned up and fixed:

1. **Loot `alternatives`:** a branch with a tool/state condition blocked every later branch, so stone showed its Silk Touch drop but no cobblestone. Found by the audit.
2. **Fish tiers were one tier too high in Phase 1**, and the 11 top-level fish were missing. Tiers now come from the pack's own star lore (`adv.kleispack.fishing.rarity.1–4`): 16 Common, 10 Uncommon, 11 Rare, 10 Epic.
3. **Ramen's `custom_model_data`** string is only treated as its model when that model exists.
4. **Split Modrinth uploads** (see §1).

## 4. The site

Built from the approved mockups:
- **Home:** hero, the differences from vanilla, spoiler mode, install checklist (updated for the two-file download), latest release notes.
- **Items and item pages:** stats (healing in hearts, effects, tool speeds, attributes, intrinsics) and every source. Recipes are drawn as station screens; loot sources are grouped by chests (with the structures holding them), mobs, fishing, digging and blocks; plus trades, fixed structure items, ores and advancement rewards. Uses cover recipes, trades, repairs and advancements.
- **Recipes:** by station, pack/vanilla filter, family, search.
- **Advancement map:** pan/zoom, detail panel, PNG/SVG export in the current spoiler mode.
- **Main route:** the From Earth → Through Hell → To Dreams spine, each step with its recipe; side branches fold out.
- **Where to find:** structures, ores (height chart), mob drops, fishing by tier and water, trades by profession and level, archaeology, and every loot table with its pools and weights.
- **Other pages:** Food (sortable by healing), Gear (materials, intrinsics, enchantments, blessings), Mechanics, My progress (per tab, export/import), Changelog, search (`/`).
- **Throughout:** day/night themes; version switcher with an "unreleased" banner.

**Spoilers:** Spoiler-free is the default, with a first-visit picker. Locked slots show a hint and a Reveal button, and revealed entries are remembered on the device. Search never matches hidden names.

## 5. Spoiler flags (`app/data/spoilers.json`)

**430 of 4,161 entries are flagged:**
- items 107
- recipes 103
- advancements 131
- loot tables 75
- structures 5
- mechanics 3
- enchantments 6

**Your two newer rules were not in the code.** Phase 1's builder never implemented them, and `spoilers.json` had no trace of them. They are now implemented and tested:
- children of hidden advancements are spoilers;
- advancements whose criteria name only spoiler items are spoilers.

Also note:
- **IDs changed** with the namespace move (`main:` → `matcha:`), so entries were regenerated under the new IDs with the same rules. You had no manual edits, so nothing moved to `orphans`.
- **Fish flags changed** with the corrected tiers: Rare and Epic now means 3★ and 4★.

## 6. Needs verification (possible pack issues)

Twelve item IDs are referenced by the pack but defined nowhere and have no model. They show a placeholder and a "needs verification" note:

`minecraft:braised_red_mushroom`, `matcha:crystal_heart`, `minecraft:heart_container`, `minecraft:music_disc_golden`, `minecraft:paradise_lost`, `matcha:pufferfish`, `minecraft:solomon`, `minecraft:avesta`, `minecraft:enoch`, `minecraft:divine_comedy`, `minecraft:quran`, `minecraft:tanakh`.

Most are leftovers from before the namespace move. For example, `matcha:advancement/fishing_sounds/treasure` checks for model `matcha:crystal_heart`, but the item is `matcha:heart_container`, so that sound probably never plays. These may be worth reporting to Klei.

## 7. Limitations

- **Unmodified vanilla foods show no hunger values.** Vanilla item defaults live in Minecraft's code, not its data files.
- **Chances are expectations.** Luck is taken as 0. Non-random conditions (e.g. "killed by a player") are shown as labels and assumed met. Weights among conditional entries are approximated.
- **Mechanics lists facts, not explanations.** Prose about how systems feel would need the author or testing.
- **Data size:** each version's data is about 3 MB (roughly 0.4 MB gzipped on Pages).

## 8. Running it

```
npm install
npm run update      # rebuild both versions (downloads Modrinth, GitHub, Minecraft 26.2)
npm run audit       # independent check against the raw pack
npm test            # builds for Pages and runs the tests (works on Windows)
npm run dev         # local site on :3001
```

Useful options:
- `node scripts/build-from-github.mjs --ref=<commit> --dry-run` builds any commit without publishing.
- `--vanilla=mcmeta` uses misode/mcmeta if Mojang is unreachable.

CI (`.github/workflows/pages.yml`) now uses Node 24. It checks twice a day for a new release or new GitHub commits, then rebuilds, lints, tests, audits and deploys.

**Phase 4:** README, then GitHub Pages deployment from this fork.
