// Structures: which loot tables, fixed chest contents, vaults and spawners
// each one contains, read from its jigsaw template pools and .nbt templates.
import fs from "node:fs";
import { readNbt } from "./nbt.mjs";
import { normalizeId, splitId, titleCase } from "./util.mjs";

const strip = (value) => String(value || "").replace(/^minecraft:/, "");

// Minecraft's hard-coded (non-jigsaw) structures place their chests in code.
const codeStructureLoot = {
  "minecraft:mineshaft": ["minecraft:chests/abandoned_mineshaft"],
  "minecraft:mineshaft_mesa": ["minecraft:chests/abandoned_mineshaft"],
  "minecraft:stronghold": ["minecraft:chests/stronghold_corridor", "minecraft:chests/stronghold_crossing", "minecraft:chests/stronghold_library"],
  "minecraft:desert_pyramid": ["minecraft:chests/desert_pyramid"],
  "minecraft:jungle_pyramid": ["minecraft:chests/jungle_temple", "minecraft:chests/jungle_temple_dispenser"],
  "minecraft:igloo": ["minecraft:chests/igloo_chest"],
  "minecraft:shipwreck": ["minecraft:chests/shipwreck_map", "minecraft:chests/shipwreck_supply", "minecraft:chests/shipwreck_treasure"],
  "minecraft:shipwreck_beached": ["minecraft:chests/shipwreck_map", "minecraft:chests/shipwreck_supply", "minecraft:chests/shipwreck_treasure"],
  "minecraft:buried_treasure": ["minecraft:chests/buried_treasure"],
  "minecraft:ocean_ruin_cold": ["minecraft:chests/underwater_ruin_big", "minecraft:chests/underwater_ruin_small"],
  "minecraft:ocean_ruin_warm": ["minecraft:chests/underwater_ruin_big", "minecraft:chests/underwater_ruin_small"],
  "minecraft:mansion": ["minecraft:chests/woodland_mansion"],
  "minecraft:end_city": ["minecraft:chests/end_city_treasure"],
  "minecraft:fortress": ["minecraft:chests/nether_bridge"],
  "minecraft:ruined_portal": ["minecraft:chests/ruined_portal"],
  "minecraft:ruined_portal_desert": ["minecraft:chests/ruined_portal"],
  "minecraft:ruined_portal_jungle": ["minecraft:chests/ruined_portal"],
  "minecraft:ruined_portal_mountain": ["minecraft:chests/ruined_portal"],
  "minecraft:ruined_portal_nether": ["minecraft:chests/ruined_portal"],
  "minecraft:ruined_portal_ocean": ["minecraft:chests/ruined_portal"],
  "minecraft:ruined_portal_swamp": ["minecraft:chests/ruined_portal"],
  "minecraft:swamp_hut": [],
  "minecraft:ocean_monument": [],
  "minecraft:nether_fossil": [],
  "minecraft:desert_well": ["minecraft:archaeology/desert_well"],
};

const containerBlocks = /chest|barrel|shulker_box|dispenser|dropper|hopper|decorated_pot|suspicious_(sand|gravel)|crafter/;

export function buildStructures({ resources, text, items }) {
  const templateCache = new Map();

  const template = (id) => {
    const templateId = normalizeId(id);
    if (templateCache.has(templateId)) return templateCache.get(templateId);
    const hit = resources.file("structure", templateId, { ext: ".nbt" });
    let info = null;
    if (hit) {
      try {
        const nbt = readNbt(fs.readFileSync(hit.file));
        info = { id: templateId, origin: hit.layer, loot: new Map(), items: new Map(), pools: new Set(), spawners: new Map(), vaults: [], entities: new Map() };
        const palette = nbt.palette || nbt.palettes?.[0] || [];
        for (const block of nbt.blocks || []) {
          const name = normalizeId(palette[block.state]?.Name || "");
          const data = block.nbt;
          if (!data) continue;
          if (typeof data.LootTable === "string") {
            info.loot.set(normalizeId(data.LootTable), (info.loot.get(normalizeId(data.LootTable)) || 0) + 1);
          }
          if (Array.isArray(data.Items) && containerBlocks.test(name)) {
            for (const stack of data.Items) addStack(info.items, stack);
          }
          if (data.item && /decorated_pot/.test(name)) addStack(info.items, data.item);
          if (typeof data.pool === "string" && data.pool !== "minecraft:empty") info.pools.add(normalizeId(data.pool));
          const spawned = data.SpawnData?.entity?.id || data.spawn_data?.entity?.id;
          if (spawned) info.spawners.set(normalizeId(spawned), (info.spawners.get(normalizeId(spawned)) || 0) + 1);
          if (data.config && /vault/.test(name)) {
            info.vaults.push({
              table: normalizeId(data.config.loot_table || "minecraft:chests/trial_chambers/reward"),
              key: data.config.key_item ? addStack(null, data.config.key_item) : null,
              ominous: /ominous=true/.test(JSON.stringify(palette[block.state]?.Properties || {})),
            });
          }
        }
        for (const entity of nbt.entities || []) {
          const data = entity.nbt || {};
          const entityId = normalizeId(data.id || "");
          if (!entityId) continue;
          info.entities.set(entityId, (info.entities.get(entityId) || 0) + 1);
          if (data.Item) addStack(info.items, data.Item);
          for (const stack of [...(data.HandItems || []), ...(data.ArmorItems || []), ...Object.values(data.equipment || {})]) addStack(info.items, stack);
        }
      } catch {
        info = null;
      }
    }
    templateCache.set(templateId, info);
    return info;
  };

  // A stack from NBT (id + count + components); returns its item key.
  function addStack(map, stack) {
    const id = stack?.id || stack?.Name;
    if (!id || id === "minecraft:air") return null;
    const key = items.define(id, stack.components || {}, "structure");
    if (map) map.set(key, (map.get(key) || 0) + Number(stack.count ?? stack.Count ?? 1));
    return key;
  }

  const poolTemplates = (poolId, seen) => {
    if (seen.has(poolId)) return [];
    seen.add(poolId);
    const pool = resources.json("worldgen/template_pool", poolId);
    if (!pool) return [];
    const out = [];
    const visit = (element, weight) => {
      const type = strip(element?.element_type);
      if (type === "list_pool_element") (element.elements || []).forEach((inner) => visit(inner, weight));
      else if (typeof element?.location === "string") out.push({ id: normalizeId(element.location), weight, pool: poolId });
    };
    for (const entry of pool.elements || []) visit(entry.element, Number(entry.weight || 1));
    if (pool.fallback && pool.fallback !== "minecraft:empty") out.push(...poolTemplates(normalizeId(pool.fallback), seen));
    return out;
  };

  const sets = new Map();
  for (const [setId] of resources.list("worldgen/structure_set")) {
    const set = resources.json("worldgen/structure_set", setId);
    for (const entry of set?.structures || []) {
      sets.set(normalizeId(entry.structure), {
        set: setId,
        spacing: set.placement?.spacing ?? null,
        separation: set.placement?.separation ?? null,
        placement: strip(set.placement?.type),
        frequency: set.placement?.frequency ?? null,
      });
    }
  }

  const structures = [];
  for (const [structureId] of resources.list("worldgen/structure")) {
    const json = resources.json("worldgen/structure", structureId);
    if (!json) continue;
    const type = strip(json.type);
    const origin = resources.origin("worldgen/structure", structureId);
    const loot = new Map();
    const fixed = new Map();
    const spawners = new Map();
    const entities = new Map();
    const vaults = [];
    let templateCount = 0;
    let packTemplates = 0;
    if (type === "jigsaw" && json.start_pool) {
      const seenPools = new Set();
      const queue = [normalizeId(json.start_pool)];
      const seenTemplates = new Set();
      while (queue.length) {
        const poolId = queue.shift();
        for (const element of poolTemplates(poolId, seenPools)) {
          if (seenTemplates.has(element.id)) continue;
          seenTemplates.add(element.id);
          const info = template(element.id);
          if (!info) continue;
          templateCount += 1;
          if (info.origin === "pack") packTemplates += 1;
          for (const [table, count] of info.loot) {
            const current = loot.get(table) || { containers: 0, templates: [] };
            current.containers += count;
            current.templates.push(element.id);
            loot.set(table, current);
          }
          for (const [key, count] of info.items) fixed.set(key, (fixed.get(key) || 0) + count);
          for (const [entity, count] of info.spawners) spawners.set(entity, (spawners.get(entity) || 0) + count);
          for (const [entity, count] of info.entities) entities.set(entity, (entities.get(entity) || 0) + count);
          vaults.push(...info.vaults.map((vault) => ({ ...vault, template: element.id })));
          for (const next of info.pools) if (!seenPools.has(next)) queue.push(next);
        }
      }
    } else {
      for (const table of codeStructureLoot[structureId] || []) loot.set(table, { containers: null, templates: [], fromCode: true });
    }
    const biomeRef = typeof json.biomes === "string" ? json.biomes : null;
    const biomeIds = resources.members("worldgen/biome", json.biomes || []);
    const [, resource] = splitId(structureId);
    structures.push({
      id: structureId,
      name: text.raw(`structure.${splitId(structureId)[0]}.${resource}`) || titleCase(resource),
      type,
      origin,
      byPack: origin === "pack" || packTemplates > 0,
      biomes: biomeIds.sort(),
      biomeTag: biomeRef,
      placement: sets.get(structureId) || null,
      templates: templateCount,
      lootTables: [...loot].map(([table, info]) => ({ table, containers: info.containers, ...(info.fromCode ? { fromCode: true } : {}), templates: [...new Set(info.templates)].slice(0, 40) })),
      fixedItems: [...fixed].map(([key, count]) => ({ key, count })),
      spawners: [...spawners].map(([entity, count]) => ({ entity, name: text.entityName(entity), count })),
      entities: [...entities].filter(([entity]) => !/item_frame|armor_stand|painting|marker/.test(entity)).map(([entity, count]) => ({ entity, name: text.entityName(entity), count })),
      vaults: dedupeVaults(vaults),
    });
  }
  return structures.sort((a, b) => a.name.localeCompare(b.name));
}

function dedupeVaults(vaults) {
  const map = new Map();
  for (const vault of vaults) {
    const key = `${vault.table}|${vault.key}|${vault.ominous}`;
    const current = map.get(key) || { table: vault.table, key: vault.key, ominous: vault.ominous, count: 0 };
    current.count += 1;
    map.set(key, current);
  }
  return [...map.values()];
}
