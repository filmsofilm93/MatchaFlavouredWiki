// Item registry. An item's identity (its "key") is its item_model when one is
// set, otherwise its base item id: that is what a player sees. Every place
// that defines an item inline (recipe results, loot functions, trades,
// advancement icons) contributes a definition; the richest one wins and the
// base items it sits on are all recorded.
import { normalizeId, splitId, titleCase } from "./util.mjs";

const ticks = (value) => Math.round((Number(value) || 0) / 20 * 10) / 10;

// Regeneration level n (amplifier n-1) heals 1 HP every (50 >> amplifier) ticks.
export function regenerationHealing(amplifier, durationTicks) {
  const interval = Math.max(1, 50 >> Math.max(0, amplifier));
  return Math.floor(durationTicks / interval);
}

export class Items {
  constructor(resources, text, assets) {
    this.resources = resources;
    this.text = text;
    this.assets = assets;
    this.map = new Map();
    this.enchantmentNames = new Map();
  }

  // Key for a stack given its base id and components.
  keyFor(baseId, components = {}) {
    const explicit = components["minecraft:item_model"] || components["item_model"];
    if (explicit) return normalizeId(explicit);
    // custom_model_data strings select a model inside the base item's model
    // definition; treat one as the identity only when that model exists.
    const custom = (components["minecraft:custom_model_data"]?.strings || [])
      .map((value) => normalizeId(String(value)))
      .find((id) => this.resources.file("items", id, { kind: "assets" }));
    return normalizeId(custom || baseId);
  }

  // Register a stack; returns its key.
  define(baseId, components = {}, source = null) {
    const id = normalizeId(baseId);
    if (!id) return null;
    const key = this.keyFor(id, components);
    let item = this.map.get(key);
    if (!item) {
      item = { key, baseIds: new Set(), definitions: [], sources: new Set() };
      this.map.set(key, item);
    }
    item.baseIds.add(id);
    if (source) item.sources.add(source);
    const weight = Object.keys(components || {}).length;
    if (weight && !item.definitions.some((entry) => JSON.stringify(entry.components) === JSON.stringify(components))) {
      item.definitions.push({ baseId: id, components, weight, source });
    }
    return key;
  }

  // Register a plain item id (an ingredient or tag member).
  plain(id) {
    return this.define(id, {});
  }

  get(key) {
    return this.map.get(normalizeId(key));
  }

  // ------------------------------------------------------------ summaries

  enchantments(value) {
    const levels = value?.levels && typeof value.levels === "object" ? value.levels : value;
    if (!levels || typeof levels !== "object") return [];
    return Object.entries(levels).map(([id, level]) => ({
      id: normalizeId(id),
      name: this.enchantmentNames.get(normalizeId(id)) || this.text.enchantmentName(id),
      level: Number(level) || 1,
    }));
  }

  effects(list, probability = 1) {
    return (list || []).filter((effect) => effect?.id).map((effect) => {
      const amplifier = Number(effect.amplifier || 0);
      const duration = Number(effect.duration ?? 0);
      const record = {
        id: normalizeId(effect.id),
        name: this.text.effectName(effect.id),
        level: amplifier + 1,
        seconds: duration < 0 ? -1 : ticks(duration),
      };
      if (probability < 1) record.chance = probability;
      if (normalizeId(effect.id) === "minecraft:regeneration" && duration > 0) {
        record.healsHp = regenerationHealing(amplifier, duration);
      }
      return record;
    });
  }

  consumable(value) {
    if (!value) return null;
    const out = {
      seconds: value.consume_seconds === undefined ? 1.6 : Number(value.consume_seconds),
      animation: String(value.animation || "eat").replace(/^minecraft:/, ""),
      effects: [],
      other: [],
    };
    for (const effect of value.on_consume_effects || []) {
      const type = String(effect.type || "").replace(/^minecraft:/, "");
      if (type === "apply_effects") out.effects.push(...this.effects(effect.effects, effect.probability ?? 1));
      else if (type === "clear_all_effects") out.other.push("Clears all effects");
      else if (type === "remove_effects") {
        const ids = this.resources.members("mob_effect", effect.effects);
        out.other.push(`Removes ${ids.map((id) => this.text.effectName(id)).join(", ") || "effects"}`);
      } else if (type === "teleport_randomly") out.other.push(`Teleports you up to ${effect.diameter ?? 16} blocks`);
      else if (type === "play_sound") continue;
      else out.other.push(titleCase(type));
    }
    const heal = out.effects.reduce((sum, effect) => sum + (effect.healsHp || 0), 0);
    if (heal) out.healsHp = heal;
    return out;
  }

  attributes(list) {
    const modifiers = Array.isArray(list) ? list : list?.modifiers;
    return (modifiers || []).filter((entry) => entry?.type).map((entry) => ({
      attribute: normalizeId(entry.type),
      name: this.text.attributeName(entry.type),
      amount: Number(entry.amount || 0),
      operation: entry.operation || "add_value",
      slot: entry.slot || "any",
    }));
  }

  // A player-facing summary of a stack's components.
  summarize(baseId, components = {}) {
    const c = (name) => components[`minecraft:${name}`] ?? components[name];
    const nameComponent = c("item_name") ?? c("custom_name");
    const rendered = nameComponent !== undefined ? this.text.render(nameComponent) : null;
    const out = {};
    if (rendered?.text) out.name = rendered.text;
    if (rendered?.color) out.color = rendered.color;
    if (c("rarity")) out.rarity = String(c("rarity"));
    const lore = (c("lore") || []).map((line) => this.text.render(line)).filter((line) => line.text);
    if (lore.length) out.lore = lore.map((line) => (line.color ? { text: line.text, color: line.color } : { text: line.text }));
    const food = c("food");
    if (food) {
      out.food = { nutrition: Number(food.nutrition || 0), saturation: Number(food.saturation || 0) };
      if (food.can_always_eat) out.food.alwaysEdible = true;
    }
    const consumable = this.consumable(c("consumable"));
    if (consumable) out.consumable = consumable;
    if (c("use_remainder")) {
      const remainder = c("use_remainder");
      out.useRemainder = this.define(remainder.id, remainder.components || {});
    }
    if (c("use_cooldown")) out.cooldown = Number(c("use_cooldown").seconds || 0);
    if (c("max_damage") !== undefined) out.durability = Number(c("max_damage"));
    if (c("max_stack_size") !== undefined) out.stack = Number(c("max_stack_size"));
    if (c("unbreakable")) out.unbreakable = true;
    const tool = c("tool");
    if (tool) {
      out.tool = {
        defaultSpeed: Number(tool.default_mining_speed ?? 1),
        damagePerBlock: Number(tool.damage_per_block ?? 1),
        rules: (tool.rules || []).map((rule) => ({
          blocks: typeof rule.blocks === "string" ? rule.blocks : [].concat(rule.blocks || []).join(", "),
          ...(rule.speed !== undefined ? { speed: Number(rule.speed) } : {}),
          ...(rule.correct_for_drops !== undefined ? { drops: Boolean(rule.correct_for_drops) } : {}),
        })),
      };
    }
    const weapon = c("weapon");
    if (weapon) out.weapon = { damagePerAttack: Number(weapon.item_damage_per_attack ?? 1), disableBlocking: Number(weapon.disable_blocking_for_seconds ?? 0) };
    const attributes = this.attributes(c("attribute_modifiers"));
    if (attributes.length) out.attributes = attributes;
    const enchantments = this.enchantments(c("enchantments"));
    if (enchantments.length) out.enchantments = enchantments;
    const stored = this.enchantments(c("stored_enchantments"));
    if (stored.length) out.storedEnchantments = stored;
    const equippable = c("equippable");
    if (equippable?.slot) out.slot = equippable.slot;
    const repairable = c("repairable");
    if (repairable?.items) out.repairWith = this.resources.members("item", repairable.items).map((id) => this.plain(id));
    if (c("glider") !== undefined) out.glider = true;
    if (c("death_protection") !== undefined) out.deathProtection = true;
    if (c("damage_resistant") !== undefined || c("fire_resistant") !== undefined) out.fireResistant = true;
    if (c("jukebox_playable")) out.jukeboxSong = normalizeId(c("jukebox_playable").song || c("jukebox_playable"));
    const custom = c("custom_data");
    if (custom && typeof custom === "object") {
      const flags = Object.keys(custom).filter((keyName) => custom[keyName]);
      if (flags.length) out.flags = flags;
    }
    return out;
  }

  // ------------------------------------------------------------ finalize

  // Resolve names and textures and produce the published item list.
  finish() {
    const items = [];
    for (const item of this.map.values()) {
      const definitions = [...item.definitions].sort((a, b) => b.weight - a.weight);
      const primary = definitions[0];
      const baseId = primary?.baseId || [...item.baseIds][0];
      const summary = primary ? this.summarize(primary.baseId, primary.components) : {};
      const [namespace] = splitId(item.key);
      const custom = item.key !== baseId || Boolean(primary) || namespace !== "minecraft";
      const name = summary.name || this.text.nameFor(item.key) || this.text.nameFor(baseId) || titleCase(item.key);
      const texture = this.assets.itemTexture(item.key) || (item.key !== baseId ? this.assets.itemTexture(baseId) : null);
      // Names that differ between definitions (the same model reused for two
      // things) are kept so the page can say so.
      const otherNames = [...new Set(definitions.slice(1).map((entry) => this.summarize(entry.baseId, entry.components).name).filter((value) => value && value !== name))];
      items.push({
        key: item.key,
        name,
        baseId,
        baseIds: [...item.baseIds].sort(),
        namespace,
        custom,
        renamed: !custom && this.isRenamed(baseId),
        texture: texture ? texture.url : null,
        // Referenced (e.g. by an advancement criterion) but defined nowhere and
        // without a model: shown as "needs verification".
        ...(!texture && !item.definitions.length && !item.sources.size ? { unverified: true } : {}),
        ...(texture?.frames ? { frames: texture.frames } : {}),
        textureOrigin: texture?.origin || null,
        ...summary,
        ...(otherNames.length ? { alsoNamed: otherNames } : {}),
        variants: definitions.length,
      });
    }
    return items.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  }

  // A vanilla item the pack renames through its language file.
  isRenamed(baseId) {
    const [namespace, resource] = splitId(baseId);
    return this.text.fromPack(`item.${namespace}.${resource}`) || this.text.fromPack(`block.${namespace}.${resource}`);
  }
}
