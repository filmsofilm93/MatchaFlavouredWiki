// World generation: ore veins (what, how many, which heights, which biomes)
// and other placed features the pack changes.
import { normalizeId, numberRange, titleCase } from "./util.mjs";

const strip = (value) => String(value || "").replace(/^minecraft:/, "");
const stepNames = ["raw_generation", "lakes", "local_modifications", "underground_structures", "surface_structures", "strongholds", "underground_ores", "underground_decoration", "fluid_springs", "vegetal_decoration", "top_layer_modification"];

export function dimensionBounds(resources) {
  const bounds = {};
  for (const [dimension, fallback] of [["overworld", [-64, 384]], ["the_nether", [0, 256]], ["the_end", [0, 256]]]) {
    const json = resources.json("dimension_type", `minecraft:${dimension}`);
    const minY = Number(json?.min_y ?? fallback[0]);
    const height = Number(json?.height ?? fallback[1]);
    bounds[dimension] = { minY, maxY: minY + height - 1 };
  }
  return bounds;
}

function anchorY(anchor, bounds) {
  if (anchor === undefined || anchor === null) return null;
  if (typeof anchor === "number") return anchor;
  if ("absolute" in anchor) return Number(anchor.absolute);
  if ("above_bottom" in anchor) return bounds.minY + Number(anchor.above_bottom);
  if ("below_top" in anchor) return bounds.maxY - Number(anchor.below_top);
  return null;
}

export function buildWorldgen({ resources, text, items }) {
  const bounds = dimensionBounds(resources);
  const nether = new Set(resources.tag("worldgen/biome", "minecraft:is_nether"));
  const end = new Set(resources.tag("worldgen/biome", "minecraft:is_end"));
  const dimensionOf = (biome) => (nether.has(biome) ? "the_nether" : end.has(biome) ? "the_end" : "overworld");

  // placed feature id -> { biomes: Set, step }
  const usage = new Map();
  const biomes = [];
  for (const [biomeId] of resources.list("worldgen/biome")) {
    const biome = resources.json("worldgen/biome", biomeId);
    if (!biome) continue;
    biomes.push({ id: biomeId, name: text.biomeName(biomeId), dimension: dimensionOf(biomeId), origin: resources.origin("worldgen/biome", biomeId) });
    (biome.features || []).forEach((step, index) => {
      for (const ref of [].concat(step)) {
        const ids = typeof ref === "string" ? resources.members("worldgen/placed_feature", ref) : [];
        for (const id of ids) {
          const entry = usage.get(id) || { biomes: new Set(), step: stepNames[index] || String(index) };
          entry.biomes.add(biomeId);
          usage.set(id, entry);
        }
      }
    });
  }

  const configured = (feature) =>
    typeof feature === "string" ? resources.json("worldgen/configured_feature", feature) : feature;

  const ores = [];
  const changedFeatures = [];
  for (const [placedId, use] of usage) {
    const placed = resources.json("worldgen/placed_feature", placedId);
    if (!placed) continue;
    const config = configured(placed.feature);
    const featureType = strip(config?.type);
    const placedOrigin = resources.origin("worldgen/placed_feature", placedId);
    const configuredOrigin = typeof placed.feature === "string" ? resources.origin("worldgen/configured_feature", placed.feature) : placedOrigin;
    const byPack = placedOrigin === "pack" || configuredOrigin === "pack";
    const biomeList = [...use.biomes];
    const dimension = dimensionOf(biomeList[0]);
    const dim = bounds[dimension];

    let count = { min: 1, max: 1 };
    let rarity = null;
    let height = null;
    for (const modifier of placed.placement || []) {
      const type = strip(modifier.type);
      if (type === "count") {
        const range = numberRange(modifier.count, 1);
        count = { min: count.min * range.min, max: count.max * range.max };
      } else if (type === "rarity_filter") rarity = 1 / Number(modifier.chance || 1);
      else if (type === "height_range") {
        const h = modifier.height || {};
        height = {
          shape: strip(h.type || "uniform"),
          min: anchorY(h.min_inclusive, dim),
          max: anchorY(h.max_inclusive, dim),
          ...(h.plateau ? { plateau: Number(h.plateau) } : {}),
        };
      }
    }

    if (featureType === "ore" || featureType === "scattered_ore") {
      const targets = (config.config?.targets || []).map((target) => {
        const block = normalizeId(target.state?.Name);
        return { key: items.plain(block), block, replaces: target.target?.tag ? titleCase(target.target.tag) : titleCase(target.target?.block || "") };
      });
      ores.push({
        id: placedId,
        configured: typeof placed.feature === "string" ? normalizeId(placed.feature) : null,
        type: featureType,
        targets,
        size: Number(config.config?.size || 0),
        airExposureDiscard: Number(config.config?.discard_chance_on_air_exposure || 0),
        perChunk: count,
        ...(rarity ? { rarity } : {}),
        height,
        dimension,
        biomeCount: biomeList.length,
        biomes: biomeList.sort(),
        byPack,
      });
    } else if (byPack) {
      changedFeatures.push({ id: placedId, type: featureType, perChunk: count, ...(rarity ? { rarity } : {}), height, dimension, biomes: biomeList.sort() });
    }
  }
  ores.sort((a, b) => a.targets[0]?.block.localeCompare(b.targets[0]?.block || "") || a.id.localeCompare(b.id));
  const packBiomes = biomes.filter((biome) => biome.origin === "pack").map((biome) => biome.id);
  return { bounds, biomes, ores, changedFeatures, packBiomes };
}
