// Villager and wandering trader trades (data-driven since 26.x): trade sets
// per profession level pick `amount` trades from a list or tag of
// villager_trade entries.
import { normalizeId, numberRange, splitId, titleCase } from "./util.mjs";

export function buildTrades({ resources, text, items, loot }) {
  const stack = (raw) => {
    if (!raw) return null;
    const id = raw.id || raw.item;
    if (!id) return null;
    const key = items.define(id, raw.components || {}, "trade");
    const count = numberRange(raw.count, 1);
    // Fish carry their star rating as lore ("adv.kleispack.fishing.rarity.N").
    const stars = /fishing\.rarity\.(\d)/.exec(JSON.stringify(raw.components?.["minecraft:lore"] || ""))?.[1];
    return { key, min: count.min, max: count.max, ...(stars ? { stars: Number(stars) } : {}) };
  };

  const trades = new Map();
  const tradeRecord = (tradeId) => {
    const id = normalizeId(tradeId);
    if (trades.has(id)) return trades.get(id);
    const json = resources.json("villager_trade", id);
    if (!json) return null;
    const gives = stack(json.gives);
    let notes = [];
    if (gives && json.given_item_modifiers?.length) {
      const applied = loot.functions(json.given_item_modifiers, null);
      if (applied.count.min !== 1 || applied.count.max !== 1) {
        gives.min = applied.count.min;
        gives.max = applied.count.max;
      }
      notes = applied.notes;
      const components = {};
      for (const fn of json.given_item_modifiers) {
        if (String(fn.function).endsWith("set_components")) Object.assign(components, fn.components || {});
      }
      if (Object.keys(components).length) {
        gives.key = items.define(json.gives.id, { ...(json.gives.components || {}), ...components }, "trade");
      }
    }
    const record = {
      id,
      wants: stack(json.wants),
      ...(json.additional_wants ? { alsoWants: stack(json.additional_wants) } : {}),
      gives,
      maxUses: Number(json.max_uses ?? 12),
      xp: Number(json.xp ?? 1),
      ...(json.reputation_discount !== undefined ? { discount: Number(json.reputation_discount) } : {}),
      ...(notes.length ? { notes } : {}),
      ...(json.merchant_predicate ? { conditional: true } : {}),
      origin: resources.origin("villager_trade", id),
    };
    trades.set(id, record);
    return record;
  };

  const professions = new Map();
  for (const [setId] of resources.list("trade_set")) {
    const set = resources.json("trade_set", setId);
    if (!set) continue;
    const [, resource] = splitId(setId);
    const [profession, tier] = resource.split("/");
    const levelMatch = /^level_(\d)$/.exec(tier || "");
    const ids = resources.members("villager_trade", set.trades);
    const list = ids.map(tradeRecord).filter(Boolean).map((trade) => trade.id);
    const entry = professions.get(profession) || {
      id: profession,
      name: profession === "wandering_trader"
        ? text.entityName("minecraft:wandering_trader")
        : text.raw(`entity.minecraft.villager.${profession}`) || titleCase(profession),
      tiers: [],
    };
    entry.tiers.push({
      id: tier,
      level: levelMatch ? Number(levelMatch[1]) : null,
      name: levelMatch ? text.raw(`merchant.level.${levelMatch[1]}`) || `Level ${levelMatch[1]}` : titleCase(tier),
      amount: numberRange(set.amount, 1).mean,
      ...(set.allow_duplicates ? { duplicates: true } : {}),
      trades: list,
    });
    professions.set(profession, entry);
  }
  for (const entry of professions.values()) entry.tiers.sort((a, b) => (a.level ?? 9) - (b.level ?? 9) || a.id.localeCompare(b.id));
  return {
    professions: [...professions.values()].sort((a, b) => a.name.localeCompare(b.name)),
    trades: [...trades.values()],
  };
}
