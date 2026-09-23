# Matcha Flavoured Field Wiki

Made by the community for the community <3

An unofficial, Minecraft-styled field guide to the
[Matcha Flavoured](https://modrinth.com/datapack/matcha-flavoured) data pack by
Klei Wright: every recipe drawn as its station's screen, every drop chance,
trade, ore vein, structure, advancement and mechanic, read straight from the
pack.

**Live site:** <https://filmsofilm93.github.io/MatchaFlavouredWiki/>

## What's in it

- **Items**: stats (healing in hearts, effects, tool speeds, attributes,
  intrinsics) and every way to get and use each item.
- **Recipes**: crafting table, Oven, Mud Kiln, Blast Furnace, Kindling,
  smithing table and stonecutter, with every ingredient in its exact slot.
- **Where to find it**: structures (chests, vaults, spawners), ores with height
  ranges, mob drops, fishing by tier and water, villager and wandering trader
  trades, archaeology, and every loot table with its pools and weights.
- **Progression**: the main route, a zoomable advancement map (PNG/SVG
  export) and a personal progress checklist.
- **Food, Gear, Mechanics** and the full changelog.

**Spoilers.** Matcha Flavoured is built around discovery, so the site opens in
Spoiler-free mode: secrets show as locked slots with a hint and a Reveal
button. Full mode shows everything. The data always contains everything;
spoilers are only a display choice, set by the editable flags in
`app/data/spoilers.json`.

**Versions.** The site shows the latest Modrinth release by default. GitHub
`main` of the [official repository](https://github.com/kleiwright/matcha-flavoured)
is available as an "unreleased" entry in the version switcher.

## Run locally

Requires Node.js `>=22.13.0` (CI uses 24). Works on Windows, macOS and Linux.

```bash
npm install
npm run dev
```

Open <http://localhost:3001/>.

## Refresh the data

```bash
npm run update:check   # is there a new release or new GitHub commit?
npm run update         # rebuild every version (downloads the pack and Minecraft)
npm run audit          # independent check of the data against the raw pack
npm run lint
npm test               # builds the Pages site and runs the tests
```

`npm run update` builds the latest Modrinth release and GitHub `main` into
`public/data/<version>.json`, exports only the textures they use to
`public/tex/`, and regenerates the spoiler flags (hand-edited entries are
kept). It stops with an error if a category of data disappears or drops
sharply, which usually means the pack changed its layout; re-run with
`--allow-drop` once you have checked.

Other options:

```bash
node scripts/update-matcha.mjs --only=release          # or --only=github
node scripts/update-matcha.mjs --vanilla=mcmeta        # if Mojang's servers are unreachable
node scripts/build-from-github.mjs --ref=<commit> --dry-run   # any commit, without publishing
```

The pipeline lives in `scripts/pipeline/`. Design notes and verification
results are in [`docs/phase-1-report.md`](docs/phase-1-report.md) and
[`docs/phase-3-report.md`](docs/phase-3-report.md).

## Automatic publishing

GitHub Pages publishes every push to `main`. Twice a day a scheduled run checks
Modrinth and the official repository. When nothing changed it stops early.
Otherwise it rebuilds the data, runs lint, tests and the audit, commits the
refreshed data and deploys the site. The workflow can also be run by hand from
the Actions tab.

## Attribution

Matcha Flavoured was created by **Klei Wright**, with contributions credited in
the pack and its release notes. The pack's credits, the font and the Minecraft
notices are in [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md). This is a fan project,
not affiliated with or endorsed by Klei Wright, Mojang or Microsoft.

## License

This wiki follows the main project and is licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
Give appropriate credit, keep reuse non-commercial, and share adaptations under
the same license. See [`LICENSE`](LICENSE) for the repository notice. The
Monocraft font keeps its own SIL Open Font License.
