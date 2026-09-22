# Matcha Flavoured Field Wiki

Made by the community for the community <3

[Matcha Flavoured](https://modrinth.com/datapack/matcha-flavoured).

**Live site:** <https://evansch0.github.io/MatchaFlavouredWiki/>

The catalogue is generated from the datapack's recipes, item definitions,
translations, models, textures, advancements, villager trades, and Modrinth
release notes.

## Run locally

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Open <http://localhost:3001/>.

The development command checks Modrinth before startup and every 30 minutes
while it is running. If the network is unavailable, the current snapshot still
opens normally.

## Refresh and verify

```bash
npm run update:check
npm run update
npm run lint
npm test
```

Every recipe, item, and advancement is extracted and published in full,
including after automatic updates. Spoilers are handled only in the display,
using the editable flags in `app/data/spoilers.json` (regenerated on each
update; hand-edited entries are kept).

When Modrinth is unreachable, or to preview unreleased changes, build from the
official GitHub repository instead:

```bash
node scripts/build-from-github.mjs --ref=<commit|branch> --vanilla=mcmeta
node scripts/audit-pipeline.mjs <packRoot> app/data/wiki-data.json
```

## Automatic publishing

GitHub Pages publishes every push to `main`. A lightweight scheduled check runs
every 12 hours against Modrinth. When nothing changed, it stops before
dependency installation or site compilation. When a release or changelog
changes, it:

1. verifies the release archive;
2. rebuilds the generated data and textures;
3. verifies that no data was withheld and refreshes the spoiler flags;
4. commits the synchronized snapshot; and
5. deploys the refreshed static site.

The workflow can also be run manually from the repository's Actions tab.

## Attribution

Matcha Flavoured was created by **Klei**, with the “Golden” music disc composed
by **Ciren**. The complete pack, inspiration, framework, and Minecraft notices
are in [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md).

## License

This wiki follows the main project and is licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
Give appropriate credit, keep reuse non-commercial, and share adaptations under
the same license. See [`LICENSE`](LICENSE) for the repository notice.
