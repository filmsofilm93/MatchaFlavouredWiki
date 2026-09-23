// Advancements (with display) and the pack's display-less recipe unlockers.
import { normalizeId, splitId, titleCase } from "./util.mjs";

export function buildAdvancements({ resources, text, items, recipes }) {
  const entries = [];
  for (const [id, hit] of resources.list("advancement")) {
    const json = resources.json("advancement", id);
    if (!json) continue;
    // Vanilla advancements that survive the pack's filter are only the
    // recipe-book ones; they are not part of the wiki.
    if (hit.layer === "vanilla" && !json.display) continue;
    entries.push({ id, json, layer: hit.layer });
  }

  const criterion = (name, raw) => {
    const conditions = raw?.conditions || {};
    const found = { items: new Set(), entities: new Set(), structures: new Set(), biomes: new Set(), effects: new Set(), blocks: new Set() };
    const visit = (node, keyName = "") => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach((value) => visit(value, keyName));
      // Item predicates: { items: id | [ids] | #tag, components: { item_model } }
      if (node.items !== undefined) {
        const model = node.components?.["minecraft:item_model"] || node.predicates?.["minecraft:item_model"];
        if (typeof model === "string") found.items.add(items.plain(model));
        else for (const id of resources.members("item", node.items)) found.items.add(items.plain(id));
      } else if (node.components?.["minecraft:item_model"]) {
        found.items.add(items.plain(node.components["minecraft:item_model"]));
      }
      if (typeof node.type === "string" && /entity|killed|player|target|child|parent/.test(keyName)) found.entities.add(normalizeId(node.type));
      if (typeof node.structures === "string") found.structures.add(normalizeId(node.structures));
      if (typeof node.biomes === "string") found.biomes.add(normalizeId(node.biomes));
      if (node.effects && typeof node.effects === "object" && !Array.isArray(node.effects)) {
        for (const effect of Object.keys(node.effects)) found.effects.add(normalizeId(effect));
      }
      if (node.blocks !== undefined && keyName !== "tool") for (const id of resources.members("block", node.blocks)) found.blocks.add(normalizeId(id));
      for (const [key, value] of Object.entries(node)) if (value && typeof value === "object") visit(value, key);
    };
    visit(conditions);
    const out = { name, trigger: String(raw?.trigger || "").replace(/^minecraft:/, "") };
    for (const [key, set] of Object.entries(found)) if (set.size) out[key] = [...set];
    const recipe = conditions.recipe_id || conditions.recipe;
    if (typeof recipe === "string") out.recipe = normalizeId(recipe);
    if (conditions.to || conditions.from) out.dimension = { from: conditions.from || null, to: conditions.to || null };
    return out;
  };

  const common = (entry) => {
    const json = entry.json;
    const rewards = json.rewards || {};
    const criteria = Object.entries(json.criteria || {}).map(([name, raw]) => criterion(name, raw));
    return {
      parent: json.parent ? normalizeId(json.parent) : null,
      criteria,
      requirements: json.requirements || [Object.keys(json.criteria || {})],
      rewards: {
        recipes: (rewards.recipes || []).map((id) => normalizeId(id)),
        loot: (rewards.loot || []).map((id) => normalizeId(id)),
        experience: Number(rewards.experience || 0),
        function: rewards.function ? normalizeId(rewards.function) : null,
      },
    };
  };

  const advancements = entries.filter((entry) => entry.json.display).map((entry) => {
    const display = entry.json.display;
    const icon = display.icon;
    const iconKey = icon ? items.define(icon.id || icon.item || icon, icon.components || {}, "advancement") : null;
    return {
      id: entry.id,
      title: text.plain(display.title) || titleCase(splitId(entry.id)[1]),
      description: text.plain(display.description),
      frame: display.frame || "task",
      hidden: display.hidden === true,
      iconKey,
      background: display.background ? normalizeId(display.background) : null,
      ...common(entry),
    };
  });

  const byId = new Map(advancements.map((entry) => [entry.id, entry]));
  const rootOf = (entry) => {
    let current = entry;
    const seen = new Set();
    while (current.parent && byId.has(current.parent) && !seen.has(current.parent)) {
      seen.add(current.parent);
      current = byId.get(current.parent);
    }
    return current.id;
  };
  for (const entry of advancements) entry.tab = rootOf(entry);
  const tabs = advancements.filter((entry) => !entry.parent || !byId.has(entry.parent)).map((root) => ({
    id: root.id,
    title: root.title,
    iconKey: root.iconKey,
    count: advancements.filter((entry) => entry.tab === root.id).length,
  }));

  const recipeUnlocks = entries.filter((entry) => !entry.json.display && entry.layer !== "vanilla")
    .map((entry) => ({ id: entry.id, ...common(entry) }));

  // What unlocks each recipe, and which recipe-book entries each displayed
  // advancement's pickups also unlock (the pack grants recipes only through
  // display-less unlockers that fire on the same item pickups).
  const unlockedBy = new Map();
  const unlockersByItem = new Map();
  for (const entry of [...advancements, ...recipeUnlocks]) {
    for (const recipeId of entry.rewards.recipes) {
      unlockedBy.set(recipeId, [...(unlockedBy.get(recipeId) || []), entry.id]);
    }
  }
  for (const unlock of recipeUnlocks) {
    if (!unlock.rewards.recipes.length) continue;
    for (const criterionEntry of unlock.criteria) {
      for (const key of criterionEntry.items || []) {
        unlockersByItem.set(key, [...(unlockersByItem.get(key) || []), unlock]);
      }
    }
  }
  for (const entry of advancements) {
    const unlocked = new Set(entry.rewards.recipes);
    for (const criterionEntry of entry.criteria) {
      if (criterionEntry.trigger !== "inventory_changed") continue;
      for (const key of criterionEntry.items || []) {
        for (const unlock of unlockersByItem.get(key) || []) unlock.rewards.recipes.forEach((id) => unlocked.add(id));
      }
    }
    entry.unlocks = [...unlocked].filter((id) => recipes.some((recipe) => recipe.id === id));
  }
  for (const recipe of recipes) recipe.unlockedBy = unlockedBy.get(recipe.id) || [];

  return { advancements: advancements.sort((a, b) => a.id.localeCompare(b.id)), tabs, recipeUnlocks };
}
