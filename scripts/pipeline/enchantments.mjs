// Enchantments the pack adds or changes (its intrinsics are enchantments too).
import { normalizeId, splitId, titleCase } from "./util.mjs";

export function buildEnchantments({ resources, text, items }) {
  const out = [];
  for (const [id, hit] of resources.list("enchantment")) {
    if (hit.layer !== "pack") continue;
    const json = resources.json("enchantment", id);
    if (!json) continue;
    const rendered = text.render(json.description);
    const effects = Object.keys(json.effects || {}).map((key) => titleCase(key));
    const functions = [];
    JSON.stringify(json.effects || {}).replace(/"function":"([^"]+)"/g, (match, fn) => functions.push(normalizeId(fn)));
    const exclusive = typeof json.exclusive_set === "string" ? json.exclusive_set : null;
    out.push({
      id,
      name: rendered.text || titleCase(splitId(id)[1]),
      ...(rendered.color ? { color: rendered.color } : {}),
      maxLevel: Number(json.max_level || 1),
      slots: json.slots || [],
      supported: typeof json.supported_items === "string" ? json.supported_items : null,
      supportedCount: resources.members("item", json.supported_items || []).length,
      ...(exclusive ? { exclusiveSet: exclusive } : {}),
      weight: Number(json.weight || 0),
      anvilCost: Number(json.anvil_cost || 0),
      effects,
      ...(functions.length ? { functions: [...new Set(functions)] } : {}),
      intrinsic: /intrinsic/.test(exclusive || "") || /intrinsic/.test(id),
      changesVanilla: splitId(id)[0] === "minecraft",
      inEnchantingTable: resources.tag("enchantment", "minecraft:in_enchanting_table").includes(id),
    });
    items.enchantmentNames.set(id, out.at(-1).name);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
