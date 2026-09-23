import { useState } from "react";
import { RecipeGui } from "../components/RecipeGui";
import { ItemIcon, Locked, Panel } from "../components/ui";
import { useWiki } from "../lib/data";
import { roman, titleCase } from "../lib/format";
import { itemHref } from "../lib/router";
import { useSpoilers } from "../lib/spoilers";
import type { Item } from "../lib/types";

const kinds = ["claymore", "dolabra", "mattock", "pickaxe", "shovel", "sword", "spear", "hoe", "axe", "helmet", "chestplate", "leggings", "boots", "shield", "bow", "shears", "crook"];
const materials = ["wooden", "stone", "copper", "bronze", "shakudo", "steel", "iron", "silver", "gold", "palatinate", "diamond", "electrum", "adamant", "netherite", "warding"];

function kindOf(item: Item) {
  const text = `${item.key} ${item.name}`.toLowerCase();
  return kinds.find((kind) => text.includes(kind)) || (item.slot ? item.slot : item.tool ? "tool" : "weapon");
}
function materialOf(item: Item) {
  const text = `${item.name} ${item.key}`.toLowerCase();
  return materials.find((material) => text.includes(material)) || "other";
}

export function GearPage() {
  const { data } = useWiki();
  const { hidden } = useSpoilers();
  const [material, setMaterial] = useState("all");
  const gear = data.items.filter((item) => (item.custom || item.renamed) && (item.tool || item.durability || item.attributes?.length));
  const present = materials.filter((entry) => gear.some((item) => materialOf(item) === entry));
  const list = gear.filter((item) => material === "all" || materialOf(item) === material).sort((a, b) => materials.indexOf(materialOf(a)) - materials.indexOf(materialOf(b)) || kindOf(a).localeCompare(kindOf(b)));
  const blessings = data.recipes.filter((recipe) => recipe.folder === "blessing");
  const enchantments = data.enchantments;
  return (
    <main className="wide">
      <div className="pagehead">
        <span className="kicker">GEAR</span>
        <h1>Tools, weapons &amp; armour</h1>
        <p>Stats come from the pack's item components: mining speed per block type, attributes, durability and the intrinsic enchantments each metal carries.</p>
      </div>
      <div className="filters">
        <button type="button" className="btn small" aria-pressed={material === "all"} onClick={() => setMaterial("all")}>All</button>
        {[...present, "other"].map((entry) => (
          <button key={entry} type="button" className="btn small" aria-pressed={material === entry} onClick={() => setMaterial(entry)}>
            {titleCase(entry)}
          </button>
        ))}
      </div>
      <Panel>
        <div className="scrollx">
          <table className="data">
            <thead>
              <tr>
                <th>Item</th>
                <th>Kind</th>
                <th className="num">Durability</th>
                <th className="num">Mining speed</th>
                <th>Attributes</th>
                <th>Intrinsics</th>
              </tr>
            </thead>
            <tbody>
              {list.map((item) => {
                const locked = hidden(`item:${item.key}`);
                const speed = Math.max(0, ...(item.tool?.rules.map((rule) => rule.speed || 0) || [0]));
                return (
                  <tr key={item.key}>
                    <td>
                      <a className="itemlink" href={itemHref(item.key)} data-tip-item={item.key}>
                        {locked ? <span className="slot small locked" /> : <ItemIcon item={item} size={32} />}
                        <span>{locked ? "???" : item.name}</span>
                      </a>
                    </td>
                    <td>{titleCase(kindOf(item))}</td>
                    <td className="num">{locked ? "?" : item.durability ?? "–"}</td>
                    <td className="num">{locked ? "?" : speed || "–"}</td>
                    <td>{locked ? "?" : (item.attributes || []).filter((a) => a.slot !== "offhand").map((a) => `${a.amount > 0 ? "+" : ""}${a.operation === "add_value" ? a.amount : `${Math.round(a.amount * 100)}%`} ${a.name}`).join(", ")}</td>
                    <td>{locked ? "?" : [...(item.enchantments || []), ...(item.storedEnchantments || [])].map((e) => `${e.name} ${roman(e.level)}`).join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel kicker="ENCHANTMENTS" title="Enchantments and intrinsics the pack adds or changes">
        <div className="scrollx">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th className="num">Max level</th>
                <th>Slots</th>
                <th>Applies to</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {enchantments.map((enchantment) => {
                const key = `enchantment:${enchantment.id}`;
                const locked = hidden(key);
                return (
                  <tr key={enchantment.id}>
                    <td>{locked ? <Locked spoilerKey={key} compact /> : enchantment.name}</td>
                    <td className="num">{locked ? "?" : roman(enchantment.maxLevel)}</td>
                    <td>{locked ? "?" : enchantment.slots.map(titleCase).join(", ")}</td>
                    <td>{locked ? "?" : enchantment.supported ? titleCase(enchantment.supported) : "–"}</td>
                    <td>
                      {locked ? "" : [enchantment.intrinsic ? "Intrinsic (comes with the metal)" : "", enchantment.changesVanilla ? "Changes Minecraft's version" : "Added by the pack", enchantment.inEnchantingTable ? "Enchanting table" : ""].filter(Boolean).join(" · ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      {blessings.length ? (
        <Panel kicker="BLESSINGS" title="Blessings">
          <p className="muted">Blessing recipes, as the pack defines them.</p>
          <div className="recipes">
            {blessings.map((recipe) => (
              <RecipeGui key={recipe.id} recipe={recipe} />
            ))}
          </div>
        </Panel>
      ) : null}
    </main>
  );
}
