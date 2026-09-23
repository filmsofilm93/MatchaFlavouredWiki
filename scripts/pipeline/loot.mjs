// Loot tables: every pool, entry, weight and condition, plus the chance that
// each item appears at least once per chest / kill / catch.
//
// The chance model (per pool roll):
//   p(entry) = factor(entry) * weight / sum(weight * factor) over the pool
// where factor is the product of random_chance style conditions (1 for
// non-random conditions such as "killed by a player", which become labels).
// A pool rolled r times gives 1 - (1 - p)^r, averaged over the roll range.
// Nested loot_table entries use the nested table's own at-least-once chance.
// Luck (bonus_rolls, quality) is taken as 0.
import { normalizeId, numberRange, splitId, titleCase } from "./util.mjs";

const strip = (value) => String(value || "").replace(/^minecraft:/, "");

export function atLeastOnce(p, rolls) {
  if (p <= 0) return 0;
  const min = Math.max(0, Math.floor(rolls.min));
  const max = Math.max(min, Math.floor(rolls.max));
  if (rolls.unknown || max - min > 64) return 1 - Math.pow(1 - p, rolls.mean);
  let sum = 0;
  for (let r = min; r <= max; r += 1) sum += 1 - Math.pow(1 - p, r);
  return sum / (max - min + 1);
}

export class Loot {
  constructor({ resources, text, items }) {
    this.resources = resources;
    this.text = text;
    this.items = items;
    this.tables = new Map(); // id -> parsed table
    this.dropCache = new Map();
  }

  // ------------------------------------------------------------ conditions

  condition(raw) {
    const type = strip(raw?.condition);
    switch (type) {
      case "random_chance": {
        const chance = numberRange(raw.chance, 1).mean;
        return { factor: chance };
      }
      case "random_chance_with_enchanted_bonus": {
        const base = numberRange(raw.unenchanted_chance, 1).mean;
        return { factor: base, label: `Higher with ${this.text.enchantmentName(raw.enchantment || "minecraft:looting")}` };
      }
      case "random_chance_with_looting":
        return { factor: Number(raw.chance ?? 1), label: "Higher with Looting" };
      case "table_bonus": {
        const chances = raw.chances || [];
        return { factor: Number(chances[0] ?? 1), label: `Higher with ${this.text.enchantmentName(raw.enchantment)}` };
      }
      case "killed_by_player":
        return { label: "Killed by a player" };
      case "survives_explosion":
        return {};
      case "match_tool": {
        const predicate = raw.predicate || {};
        const enchantments = [
          ...(predicate.predicates?.["minecraft:enchantments"] || []),
          ...(predicate.enchantments || []),
        ].flatMap((entry) => this.resources.members("enchantment", entry.enchantments));
        if (enchantments.length) return { label: `Tool with ${enchantments.map((id) => this.text.enchantmentName(id)).join(" or ")}` };
        const tools = this.resources.members("item", predicate.items || []);
        if (tools.length) {
          const names = tools.slice(0, 3).map((id) => this.text.nameFor(id) || titleCase(id));
          return { label: `Using ${names.join(" or ")}${tools.length > 3 ? " (or similar)" : ""}` };
        }
        return { label: "Specific tool" };
      }
      case "entity_properties": {
        const predicate = raw.predicate || {};
        if (predicate.flags?.is_on_fire) return { label: "Mob on fire" };
        if (predicate.type_specific?.variant) return { label: `${titleCase(predicate.type_specific.variant)} variant` };
        if (predicate.location?.biomes) return { label: `In ${this.biomeLabel(predicate.location.biomes)}` };
        return { label: "Mob condition" };
      }
      case "damage_source_properties":
        return { label: "Specific damage" };
      case "weather_check":
        return { label: raw.thundering ? "During a thunderstorm" : raw.raining ? "While raining" : "Weather" };
      case "location_check": {
        const predicate = raw.predicate || {};
        if (predicate.biomes) return { label: `In ${this.biomeLabel(predicate.biomes)}` };
        if (predicate.structures) return { label: `In ${this.structureLabel(predicate.structures)}` };
        if (predicate.dimension) return { label: `In the ${titleCase(predicate.dimension)}` };
        if (predicate.fluid) return { label: "In water" };
        return { label: "Location condition" };
      }
      case "time_check":
        return { label: "Time of day" };
      case "block_state_property":
        return { label: "Block state" };
      case "inverted": {
        const inner = this.condition(raw.term);
        return inner.factor !== undefined && !inner.label ? { factor: 1 - inner.factor } : { label: inner.label ? `Not: ${inner.label}` : undefined };
      }
      case "any_of":
      case "alternative": {
        const terms = (raw.terms || []).map((term) => this.condition(term));
        const labels = terms.map((term) => term.label).filter(Boolean);
        return { label: labels.length ? labels.join(" or ") : undefined };
      }
      case "all_of": {
        const terms = (raw.terms || []).map((term) => this.condition(term));
        return {
          factor: terms.reduce((product, term) => product * (term.factor ?? 1), 1),
          label: terms.map((term) => term.label).filter(Boolean).join(", ") || undefined,
        };
      }
      case "reference":
        return { label: `Predicate ${raw.name}` };
      case "value_check":
      case "entity_scores":
        return { label: "Scoreboard condition" };
      default:
        return type ? { label: titleCase(type) } : {};
    }
  }

  conditions(list) {
    let factor = 1;
    const labels = [];
    for (const raw of list || []) {
      const result = this.condition(raw);
      if (result.factor !== undefined) factor *= result.factor;
      if (result.label) labels.push(result.label);
    }
    return { factor, labels };
  }

  biomeLabel(value) {
    const ids = this.resources.members("worldgen/biome", value);
    if (typeof value === "string" && value.startsWith("#")) return `${titleCase(value.slice(1))} biomes`;
    return ids.slice(0, 3).map((id) => this.text.biomeName(id)).join(" or ") || "a biome";
  }

  structureLabel(value) {
    const ids = this.resources.members("worldgen/structure", value);
    return ids.slice(0, 3).map((id) => titleCase(id)).join(" or ") || "a structure";
  }

  // ------------------------------------------------------------ functions

  // Apply a function list to an item entry: components that change the
  // item's identity, count, and readable notes.
  functions(list, entry) {
    const components = {};
    let count = { min: 1, max: 1 };
    const notes = [];
    const apply = (fn, conditional) => {
      const type = strip(fn?.function);
      const guard = fn?.conditions?.length ? this.conditions(fn.conditions) : null;
      const onlyIf = guard?.labels?.length ? ` (${guard.labels.join(", ")})` : "";
      switch (type) {
        case "set_count": {
          const range = numberRange(fn.count, 1);
          if (fn.add) count = { min: count.min + range.min, max: count.max + range.max };
          else if (guard || conditional) count = { min: Math.min(count.min, range.min), max: Math.max(count.max, range.max) };
          else count = { min: range.min, max: range.max };
          break;
        }
        case "set_components":
          if (!guard && !conditional) Object.assign(components, fn.components || {});
          break;
        case "set_name":
          if (!guard && !conditional && fn.name !== undefined) components[fn.target === "custom_name" ? "minecraft:custom_name" : "minecraft:item_name"] = fn.name;
          break;
        case "set_lore":
          if (!guard && !conditional && Array.isArray(fn.lore) && (fn.mode === undefined || fn.mode === "replace_all")) components["minecraft:lore"] = fn.lore;
          break;
        case "enchant_randomly":
          notes.push(`Random enchantment${fn.options ? ` from ${typeof fn.options === "string" ? titleCase(fn.options.replace(/^#/, "")) : "a set"}` : ""}${onlyIf}`);
          break;
        case "enchant_with_levels": {
          const levels = numberRange(fn.levels, 0);
          notes.push(`Enchanted at level ${levels.min === levels.max ? levels.min : `${levels.min}-${levels.max}`}${onlyIf}`);
          break;
        }
        case "set_enchantments":
          notes.push(`Enchanted: ${Object.entries(fn.enchantments || {}).map(([id, level]) => `${this.text.enchantmentName(id)} ${numberRange(level, 1).min}`).join(", ")}${onlyIf}`);
          break;
        case "looting_enchant":
        case "enchanted_count_increase":
          notes.push(`More with ${this.text.enchantmentName(fn.enchantment || "minecraft:looting")}`);
          break;
        case "apply_bonus":
          notes.push(`More with ${this.text.enchantmentName(fn.enchantment)}`);
          break;
        case "furnace_smelt":
          notes.push(`Cooked${onlyIf || " when on fire"}`);
          break;
        case "set_damage": {
          const damage = numberRange(fn.damage, 1);
          notes.push(`Damaged (${Math.round((1 - damage.max) * 100)}-${Math.round((1 - damage.min) * 100)}% worn)`);
          break;
        }
        case "exploration_map":
          notes.push(`Map to the nearest ${titleCase(String(fn.destination || "structure").replace(/^#/, ""))}`);
          break;
        case "set_potion":
          notes.push(`Potion: ${titleCase(fn.id)}`);
          break;
        case "set_stew_effect":
          notes.push("Random stew effect");
          break;
        case "set_instrument":
          notes.push(`Instrument: ${titleCase(String(fn.options).replace(/^#/, ""))}`);
          break;
        case "filtered":
          if (fn.on_pass) apply(fn.on_pass, true);
          if (fn.on_fail) apply(fn.on_fail, true);
          break;
        case "sequence":
          for (const inner of fn.functions || []) apply(inner, conditional);
          break;
        case "explosion_decay":
        case "limit_count":
        case "copy_components":
        case "copy_state":
        case "copy_name":
        case "set_custom_data":
        case "copy_custom_data":
        case "toggle_tooltips":
          break;
        case "reference": {
          const modifier = this.resources.json("item_modifier", fn.name);
          for (const inner of [].concat(modifier || [])) apply(inner, conditional);
          break;
        }
        default:
          if (type) notes.push(titleCase(type));
      }
    };
    for (const fn of list || []) apply(fn, false);
    const key = entry ? this.items.define(entry, components, "loot") : null;
    return { key, count, notes };
  }

  // ------------------------------------------------------------ parsing

  table(id) {
    const tableId = normalizeId(id);
    if (this.tables.has(tableId)) return this.tables.get(tableId);
    this.tables.set(tableId, null); // cycle guard
    const json = this.resources.json("loot_table", tableId);
    if (!json) return null;
    const parsed = this.parse(tableId, json);
    this.tables.set(tableId, parsed);
    return parsed;
  }

  parse(id, json) {
    const tableFunctions = json.functions || [];
    const pools = (json.pools || []).map((pool) => {
      const guard = this.conditions(pool.conditions);
      return {
        rolls: numberRange(pool.rolls, 1),
        factor: guard.factor,
        labels: guard.labels,
        entries: (pool.entries || []).map((entry) => this.entry(entry, [...(pool.functions || []), ...tableFunctions])),
      };
    });
    return { id, type: strip(json.type || "generic"), pools, randomSequence: json.random_sequence || null };
  }

  entry(raw, inherited) {
    const type = strip(raw?.type);
    const guard = this.conditions(raw?.conditions);
    const base = { type, weight: Number(raw?.weight ?? 1), factor: guard.factor, labels: guard.labels };
    const functions = [...(raw?.functions || []), ...(inherited || [])];
    if (type === "item") {
      const { key, count, notes } = this.functions(functions, normalizeId(raw.name));
      return { ...base, key, count, notes };
    }
    if (type === "tag") {
      const members = this.resources.tag("item", normalizeId(raw.name));
      const children = members.map((id) => ({ ...this.functions(functions, id), type: "item", weight: 1, factor: 1, labels: [] }));
      // expand: each member is its own weighted entry; otherwise one stack of every member
      return { ...base, type: raw.expand ? "tag_expand" : "tag_all", tag: normalizeId(raw.name), children };
    }
    if (type === "loot_table") {
      if (typeof raw.value === "string") return { ...base, table: normalizeId(raw.value), notes: this.functions(functions, null).notes };
      const inline = this.parse(`inline`, raw.value || {});
      return { ...base, type: "inline_table", inline };
    }
    if (type === "group" || type === "alternatives" || type === "sequence") {
      return { ...base, children: (raw.children || []).map((child) => this.entry(child, functions)) };
    }
    if (type === "empty") return base;
    if (type === "dynamic") return { ...base, notes: [`Contents of ${titleCase(raw.name)}`] };
    return base;
  }

  // ------------------------------------------------------------ chances

  // Map key -> { p, min, max, labels, notes } for one entry being selected.
  entryDrops(entry, depth = 0) {
    const out = new Map();
    const add = (key, p, info) => {
      if (!key || p <= 0) return;
      const current = out.get(key);
      if (!current) out.set(key, { p, min: info.min, max: info.max, labels: [...info.labels], notes: [...info.notes] });
      else {
        current.p = 1 - (1 - current.p) * (1 - p);
        current.min = Math.min(current.min, info.min);
        current.max = Math.max(current.max, info.max);
        for (const label of info.labels) if (!current.labels.includes(label)) current.labels.push(label);
        for (const note of info.notes) if (!current.notes.includes(note)) current.notes.push(note);
      }
    };
    if (depth > 12) return out;
    switch (entry.type) {
      case "item":
        add(entry.key, 1, { min: entry.count.min, max: entry.count.max, labels: entry.labels, notes: entry.notes });
        break;
      case "tag_all":
        for (const child of entry.children) add(child.key, 1, { min: child.count.min, max: child.count.max, labels: entry.labels, notes: child.notes });
        break;
      case "tag_expand":
        for (const child of entry.children) add(child.key, 1 / entry.children.length, { min: child.count.min, max: child.count.max, labels: entry.labels, notes: child.notes });
        break;
      case "loot_table":
      case "inline_table": {
        const nested = entry.type === "inline_table" ? this.tableDrops(entry.inline, depth + 1) : this.dropsFor(entry.table, depth + 1);
        for (const [key, info] of nested) add(key, info.p, { ...info, labels: [...entry.labels, ...info.labels], notes: [...(entry.notes || []), ...info.notes] });
        break;
      }
      case "group":
        for (const child of entry.children) {
          for (const [key, info] of this.entryDrops(child, depth + 1)) add(key, info.p * child.factor, { ...info, labels: [...entry.labels, ...child.labels, ...info.labels] });
        }
        break;
      case "alternatives":
      case "sequence": {
        let remaining = 1;
        for (const child of entry.children) {
          const reach = entry.type === "alternatives" ? remaining * child.factor : remaining * child.factor;
          for (const [key, info] of this.entryDrops(child, depth + 1)) add(key, info.p * reach, { ...info, labels: [...entry.labels, ...child.labels, ...info.labels] });
          remaining = entry.type === "alternatives" ? remaining * (1 - child.factor) : remaining * child.factor;
          if (remaining <= 0) break;
        }
        break;
      }
      default:
        break;
    }
    return out;
  }

  tableDrops(table, depth = 0) {
    const result = new Map();
    for (const pool of table?.pools || []) {
      const total = pool.entries.reduce((sum, entry) => sum + entry.weight * entry.factor, 0);
      if (!total) continue;
      const perRoll = new Map();
      for (const entry of pool.entries) {
        const chance = (entry.weight * entry.factor) / total;
        for (const [key, info] of this.entryDrops(entry, depth)) {
          const current = perRoll.get(key);
          const p = chance * info.p;
          if (!current) perRoll.set(key, { ...info, p });
          else {
            current.p += p;
            current.min = Math.min(current.min, info.min);
            current.max = Math.max(current.max, info.max);
            for (const label of info.labels) if (!current.labels.includes(label)) current.labels.push(label);
          }
        }
      }
      for (const [key, info] of perRoll) {
        const p = atLeastOnce(Math.min(1, info.p), pool.rolls) * pool.factor;
        const labels = [...pool.labels, ...info.labels];
        const current = result.get(key);
        if (!current) result.set(key, { ...info, p, labels });
        else {
          current.p = 1 - (1 - current.p) * (1 - p);
          current.min = Math.min(current.min, info.min);
          current.max = Math.max(current.max, info.max);
        }
      }
    }
    return result;
  }

  dropsFor(id, depth = 0) {
    const tableId = normalizeId(id);
    if (this.dropCache.has(tableId)) return this.dropCache.get(tableId);
    if (depth > 12) return new Map();
    this.dropCache.set(tableId, new Map()); // cycle guard
    const drops = this.tableDrops(this.table(tableId), depth);
    this.dropCache.set(tableId, drops);
    return drops;
  }

  // ------------------------------------------------------------ output

  category(id) {
    const [, resource] = splitId(id);
    const top = resource.split("/")[0];
    if (resource.startsWith("gameplay/fishing")) return "fishing";
    if (["chests", "entities", "archaeology", "blocks", "shearing", "gameplay", "equipment", "pots", "spawners", "harvest", "dispensers", "brush"].includes(top)) return top;
    return "other";
  }

  label(id) {
    const [namespace, resource] = splitId(id);
    const parts = resource.split("/");
    const last = parts.at(-1);
    switch (parts[0]) {
      case "entities":
        return this.text.entityName(`${namespace === "minecraft" ? "minecraft" : namespace}:${parts[1]}`) + (parts.length > 2 ? ` (${titleCase(parts.slice(2).join(" "))})` : "");
      case "blocks":
        return this.text.nameFor(`minecraft:${last}`) || titleCase(last);
      case "gameplay":
        return parts[1] === "fishing" ? `Fishing: ${titleCase(parts.slice(2).join(" ") || "all")}` : titleCase(parts.slice(1).join(" "));
      case "chests":
        return titleCase(parts.slice(1).join(" "));
      default:
        return titleCase(parts.join(" "));
    }
  }

  publish(id) {
    const table = this.table(id);
    if (!table) return null;
    const round = (value) => Math.round(value * 1e6) / 1e6;
    const drops = [...this.dropsFor(id)].map(([key, info]) => ({
      key,
      chance: round(Math.min(1, info.p)),
      min: info.min,
      max: info.max,
      ...(info.labels.length ? { conditions: [...new Set(info.labels)] } : {}),
      ...(info.notes.length ? { notes: [...new Set(info.notes)] } : {}),
    })).sort((a, b) => b.chance - a.chance);
    const pools = table.pools.map((pool) => {
      const total = pool.entries.reduce((sum, entry) => sum + entry.weight * entry.factor, 0) || 1;
      return {
        rolls: pool.rolls.min === pool.rolls.max ? [pool.rolls.min] : [pool.rolls.min, pool.rolls.max],
        ...(pool.labels.length ? { conditions: pool.labels } : {}),
        ...(pool.factor < 1 ? { chance: round(pool.factor) } : {}),
        entries: pool.entries.map((entry) => ({
          type: entry.type,
          ...(entry.key ? { key: entry.key } : {}),
          ...(entry.table ? { table: entry.table } : {}),
          ...(entry.tag ? { tag: entry.tag } : {}),
          ...(entry.children && entry.type.startsWith("tag") ? { keys: entry.children.map((child) => child.key) } : {}),
          ...(entry.children && !entry.type.startsWith("tag") ? { children: entry.children.map((child) => child.key || child.table || child.type) } : {}),
          weight: entry.weight,
          perRoll: round((entry.weight * entry.factor) / total),
          ...(entry.count && (entry.count.min !== 1 || entry.count.max !== 1) ? { count: [entry.count.min, entry.count.max] } : {}),
          ...(entry.labels.length ? { conditions: entry.labels } : {}),
          ...(entry.factor < 1 ? { conditionChance: round(entry.factor) } : {}),
          ...(entry.notes?.length ? { notes: entry.notes } : {}),
        })),
      };
    });
    const includes = [];
    const collect = (entries) => entries.forEach((entry) => {
      if (entry.table) includes.push(entry.table);
      if (entry.children && !entry.type.startsWith("tag")) collect(entry.children);
    });
    table.pools.forEach((pool) => collect(pool.entries));
    return {
      id,
      label: this.label(id),
      category: this.category(id),
      type: table.type,
      origin: this.resources.origin("loot_table", id),
      pools,
      drops,
      ...(includes.length ? { includes: [...new Set(includes)] } : {}),
    };
  }
}
