import { useState, type ReactNode } from "react";
import { RecipeGui } from "../components/RecipeGui";
import { Chance, EffectLine, Empty, GlyphText, Hearts, ItemLink, Panel, PixelIcon, SecretBadge, Slot } from "../components/ui";
import { useWiki } from "../lib/data";
import { dimensionName, range, roman, seconds, titleCase } from "../lib/format";
import { advHref, href, lootHref, structureHref } from "../lib/router";
import { useSpoilers } from "../lib/spoilers";
import type { Item, LootDrop, LootTable, Recipe } from "../lib/types";

const categoryLabels: Record<string, [string, string]> = {
  chests: ["Chests", "chest"],
  entities: ["Mob drops", "mob"],
  fishing: ["Fishing", "fish"],
  archaeology: ["Archaeology", "brush"],
  blocks: ["Breaking blocks", "pick"],
  shearing: ["Shearing", "gear"],
  gameplay: ["Other gameplay", "reward"],
  equipment: ["Mob equipment", "gear"],
  pots: ["Decorated pots", "chest"],
  spawners: ["Trial spawners", "mob"],
  other: ["Pack loot tables (used by other tables, advancements or scripts)", "reward"],
};

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function Stats({ item }: { item: Item }) {
  const { ix } = useWiki();
  const fish = ix.fish.get(item.key);
  const rows: ReactNode[] = [];
  if (item.food) rows.push(<Stat key="food" label="Hunger">{item.food.nutrition} food, {item.food.saturation} saturation{item.food.alwaysEdible ? " · always edible" : ""}</Stat>);
  if (item.consumable) {
    const c = item.consumable;
    rows.push(<Stat key="use" label={c.animation === "drink" ? "Drink time" : "Eat time"}>{seconds(c.seconds)}</Stat>);
    if (c.healsHp) rows.push(<Stat key="heal" label="Heals"><Hearts hp={c.healsHp} /> over time (Regeneration)</Stat>);
    if (c.effects.length) rows.push(<Stat key="effects" label="Effects">{c.effects.map((effect, i) => <div key={i}><EffectLine effect={effect} /></div>)}</Stat>);
    if (c.other.length) rows.push(<Stat key="other" label="Also">{c.other.join(", ")}</Stat>);
  }
  if (item.useRemainder) rows.push(<Stat key="rem" label="Leaves behind"><ItemLink itemKey={item.useRemainder} /></Stat>);
  if (item.cooldown) rows.push(<Stat key="cd" label="Cooldown">{seconds(item.cooldown)}</Stat>);
  if (item.durability) rows.push(<Stat key="dur" label="Durability">{item.durability}</Stat>);
  if (item.unbreakable) rows.push(<Stat key="unb" label="Durability">Unbreakable</Stat>);
  if (item.stack !== undefined) rows.push(<Stat key="stack" label="Stacks to">{item.stack}</Stat>);
  if (item.tool) {
    rows.push(
      <Stat key="tool" label="Mining">
        {item.tool.rules.filter((rule) => rule.speed !== undefined).map((rule, i) => (
          <div key={i}>
            Speed {rule.speed} on {titleCase(rule.blocks)}
            {rule.drops ? "" : rule.drops === false ? " (no drops)" : ""}
          </div>
        ))}
        {item.tool.damagePerBlock !== 1 ? <div>Wears {item.tool.damagePerBlock} per block</div> : null}
      </Stat>,
    );
  }
  if (item.attributes?.length) {
    rows.push(
      <Stat key="attr" label="Attributes">
        {item.attributes.map((a, i) => (
          <div key={i}>
            {a.amount > 0 ? "+" : ""}
            {a.operation === "add_value" ? a.amount : `${Math.round(a.amount * 100)}%`} {a.name}
            <span className="muted"> ({a.slot})</span>
          </div>
        ))}
      </Stat>,
    );
  }
  for (const [label, list] of [["Enchantments", item.enchantments], ["Stored enchantments", item.storedEnchantments]] as const) {
    if (list?.length) rows.push(<Stat key={label} label={label}>{list.map((e) => `${e.name} ${roman(e.level)}`).join(", ")}</Stat>);
  }
  if (item.slot) rows.push(<Stat key="slot" label="Worn on">{titleCase(item.slot)}</Stat>);
  if (item.repairWith?.length) rows.push(<Stat key="rep" label="Repaired with"><div className="taglist">{item.repairWith.map((key) => <ItemLink key={key} itemKey={key} />)}</div></Stat>);
  if (item.flags?.length) rows.push(<Stat key="flags" label="Tags">{item.flags.map(titleCase).join(", ")}</Stat>);
  if (item.glider) rows.push(<Stat key="glider" label="Special">Lets you glide</Stat>);
  if (item.deathProtection) rows.push(<Stat key="dp" label="Special">Saves you from death</Stat>);
  if (item.fireResistant) rows.push(<Stat key="fr" label="Special">Survives fire and lava</Stat>);
  if (fish) rows.push(<Stat key="fish" label="Fish">{"★".repeat(fish.stars)} {fish.tier} · the fisherman buys {fish.sells} at level {fish.level}</Stat>);
  if (!rows.length) return null;
  return (
    <Panel kicker="STATS">
      <dl className="facts">{rows}</dl>
    </Panel>
  );
}

function RecipeList({ recipes, empty, initial = 8 }: { recipes: Recipe[]; empty?: string; initial?: number }) {
  const [limit, setLimit] = useState(initial);
  if (!recipes.length) return empty ? <Empty>{empty}</Empty> : null;
  return (
    <>
      <div className="recipes">
        {recipes.slice(0, limit).map((recipe) => (
          <RecipeGui key={recipe.id} recipe={recipe} />
        ))}
      </div>
      {recipes.length > limit ? (
        <div className="pager">
          <button type="button" className="btn small" onClick={() => setLimit(limit + 12)}>
            Show more ({recipes.length - limit} left)
          </button>
        </div>
      ) : null}
    </>
  );
}

function LootSource({ table, drop }: { table: LootTable; drop: LootDrop }) {
  const { ix } = useWiki();
  const { hidden } = useSpoilers();
  const structures = ix.structuresByTable.get(table.id) || [];
  const parents = (ix.tableParents.get(table.id) || []).map((id) => ix.loot.get(id)).filter(Boolean) as LootTable[];
  const rewards = ix.rewardAdvsByTable.get(table.id) || [];
  const perWhat = table.category === "chests" ? "per chest" : table.category === "entities" ? "per kill" : table.category === "fishing" ? "per catch" : table.category === "archaeology" ? "per brush" : "per roll";
  return (
    <div className="src">
      <PixelIcon name={categoryLabels[table.category]?.[1] || "chest"} />
      <div>
        <a href={lootHref(table.id)}>{table.label}</a> <span className="sub">· {perWhat} · {range(drop.min, drop.max)} each</span>
        {structures.length ? (
          <div className="sub">
            In{" "}
            {structures.slice(0, 4).map((structure, i) => (
              <span key={structure.id}>
                {i ? ", " : ""}
                {hidden(`structure:${structure.id}`) ? "???" : <a href={structureHref(structure.id)}>{structure.name}</a>}
              </span>
            ))}
          </div>
        ) : null}
        {parents.length ? (
          <div className="sub">
            Part of{" "}
            {parents.slice(0, 4).map((parent, i) => (
              <span key={parent.id}>
                {i ? ", " : ""}
                <a href={lootHref(parent.id)}>{parent.label}</a>
              </span>
            ))}
            {parents.length > 4 ? ` and ${parents.length - 4} more` : ""}
          </div>
        ) : null}
        {rewards.length ? <div className="sub">Reward for {rewards.map((adv) => (hidden(`advancement:${adv.id}`) ? "???" : `“${adv.title}”`)).join(", ")}</div> : null}
        {drop.conditions?.length ? <div className="sub">Only when: {drop.conditions.join("; ")}</div> : null}
        {drop.notes?.length ? <div className="sub">{drop.notes.join("; ")}</div> : null}
      </div>
      <Chance p={drop.chance} />
    </div>
  );
}

export function ItemPage({ itemKey }: { itemKey: string }) {
  const { data, ix } = useWiki();
  const { hidden, reveal, hint } = useSpoilers();
  const item = ix.item.get(itemKey);
  if (!item) {
    return (
      <main>
        <h1>Unknown item</h1>
        <p className="onbg">
          {itemKey} is not in this version. <a href={href("items")}>All items</a>
        </p>
      </main>
    );
  }
  const key = `item:${item.key}`;
  const locked = hidden(key);
  const made = ix.recipesByResult.get(item.key) || [];
  const packMade = made.filter((recipe) => recipe.origin !== "vanilla");
  const vanillaMade = made.filter((recipe) => recipe.origin === "vanilla");
  const uses = ix.recipesByIngredient.get(item.key) || [];
  const drops = (ix.dropsByItem.get(item.key) || []).sort((a, b) => b.drop.chance - a.drop.chance);
  const grouped = new Map<string, typeof drops>();
  for (const entry of drops) {
    const category = entry.table.category === "other" && !entry.table.id.startsWith("minecraft:") ? "other" : entry.table.category;
    grouped.set(category, [...(grouped.get(category) || []), entry]);
  }
  const sells = ix.tradesGiving.get(item.key) || [];
  const buys = ix.tradesWanting.get(item.key) || [];
  const placed = ix.structuresByItem.get(item.key) || [];
  const ores = ix.ores.get(item.key) || [];
  const criteria = ix.advsByItem.get(item.key) || [];
  const repairs = ix.repairs.get(item.key) || [];
  const remainderOf = ix.remainders.get(item.key) || [];
  const noSources = !made.length && !drops.length && !sells.length && !placed.length && !ores.length;

  const head = locked ? (
    <div className="lockcard">
      <Slot itemKey={item.key} size="big" link={false} />
      <div>
        <h1>???</h1>
        <div className="hint">{hint(key)}</div>
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn small" onClick={() => reveal(key)}>
            Reveal this entry
          </button>
        </div>
      </div>
    </div>
  ) : (
    <div className="itemhead">
      <Slot itemKey={item.key} size="big" link={false} />
      <div>
        <h1>{item.name}</h1>
        <div className="taglist">
          {item.custom ? <span className="badge">Pack item</span> : item.renamed ? <span className="badge gold">Renamed by the pack</span> : <span className="badge stone">Minecraft</span>}
          <SecretBadge spoilerKey={key} />
          {item.unverified ? <span className="badge warn" title="Referenced by the pack, but no item uses this model">Needs verification</span> : null}
          <code>{item.key}</code>
        </div>
        {item.baseIds.some((id) => id !== item.key) ? <div className="muted">Built on {item.baseIds.map((id) => ix.item.get(id)?.name || titleCase(id)).join(", ")}</div> : null}
        {item.alsoNamed?.length ? <div className="muted">Also appears as {item.alsoNamed.join(", ")}</div> : null}
        {item.lore?.length ? (
          <div className="loretip">
            {item.lore.map((line, i) => (
              <div key={i} style={{ color: line.color || "#AAAAAA" }}>
                <GlyphText text={line.text} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <main>
      <p className="onbg">
        <a href={href("items")} style={{ color: "#55ffff" }}>
          ← Items
        </a>
      </p>
      <Panel>{head}</Panel>
      {item.unverified && !locked ? (
        <Panel kicker="NEEDS VERIFICATION">
          <p style={{ margin: 0 }}>
            The pack refers to this item (for example in an advancement's criteria), but no recipe, loot table or trade creates it and the resource pack has no model for it. It may be left over from an older version.
          </p>
        </Panel>
      ) : null}
      {!locked ? <Stats item={item} /> : null}
      <Panel kicker="HOW TO GET" title={locked ? "Where it's found" : "All sources"}>
        {locked ? <p className="muted">Places are shown; the item stays hidden until you reveal it.</p> : null}
        {noSources ? <Empty>No recipe, loot table, trade, structure or ore produces this item in {data.release.version}. It may come from a script (function) or not be obtainable in survival.</Empty> : null}
        {made.length && !locked ? (
          <>
            <h3>Crafting &amp; cooking</h3>
            <RecipeList recipes={packMade} />
            {vanillaMade.length ? (
              <details style={{ marginTop: 9 }}>
                <summary>Unchanged Minecraft recipes ({vanillaMade.length})</summary>
                <RecipeList recipes={vanillaMade} />
              </details>
            ) : null}
          </>
        ) : null}
        {[...grouped].map(([category, list]) => (
          <div key={category} style={{ marginTop: 18 }}>
            <h3>{categoryLabels[category]?.[0] || titleCase(category)}</h3>
            <div className="srcs">
              {list.slice(0, 30).map(({ table, drop }) => (
                <LootSource key={table.id} table={table} drop={drop} />
              ))}
              {list.length > 30 ? <Empty>…and {list.length - 30} more tables.</Empty> : null}
            </div>
          </div>
        ))}
        {sells.length ? (
          <div style={{ marginTop: 18 }}>
            <h3>Traded by villagers</h3>
            <div className="srcs">
              {sells.map(({ trade, profession, tier }) => (
                <div className="src" key={trade.id}>
                  <PixelIcon name="trade" />
                  <div>
                    {profession.name} · {tier.name}
                    <div className="trade">
                      {trade.wants ? <Slot itemKey={trade.wants.key} count={trade.wants.max} /> : null}
                      {trade.alsoWants ? <Slot itemKey={trade.alsoWants.key} count={trade.alsoWants.max} /> : null}
                      <span className="onpanel">→</span>
                      {trade.gives ? <Slot itemKey={trade.gives.key} count={trade.gives.max} /> : null}
                      {trade.gives && trade.gives.min !== trade.gives.max ? <span className="muted">({range(trade.gives.min, trade.gives.max)})</span> : null}
                    </div>
                    {trade.notes?.length ? <div className="sub">{trade.notes.join("; ")}</div> : null}
                  </div>
                  <span className="muted">×{trade.maxUses}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {placed.length ? (
          <div style={{ marginTop: 18 }}>
            <h3>Placed in structures</h3>
            <div className="srcs">
              {placed.map(({ structure, count }) => (
                <div className="src" key={structure.id}>
                  <PixelIcon name="map" />
                  <div>{hidden(`structure:${structure.id}`) ? "???" : <a href={structureHref(structure.id)}>{structure.name}</a>} <span className="sub">· fixed contents, not random loot</span></div>
                  <span>×{count}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {ores.length ? (
          <div style={{ marginTop: 18 }}>
            <h3>Generates in the world</h3>
            <div className="srcs">
              {ores.map((ore) => (
                <div className="src" key={ore.id}>
                  <PixelIcon name="pick" />
                  <div>
                    <a href={href("places", "ores")}>{dimensionName[ore.dimension]}</a>: veins of up to {ore.size}, {range(ore.perChunk.min, ore.perChunk.max)} per chunk{ore.rarity ? ` (in ${Math.round(ore.rarity * 100)}% of chunks)` : ""}
                    {ore.height ? `, Y ${ore.height.min} to ${ore.height.max}` : ""} · {ore.biomeCount} biomes
                    {ore.byPack ? <span className="badge" style={{ marginLeft: 6 }}>changed by the pack</span> : null}
                  </div>
                  <span />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Panel>
      {!locked ? (
        <Panel kicker="USES" title="What it's used in">
          <RecipeList recipes={uses} empty="No recipe uses this item." initial={6} />
          {buys.length ? (
            <>
              <h3 style={{ marginTop: 18 }}>Villagers buy it</h3>
              <div className="srcs">
                {buys.map(({ trade, profession, tier }) => (
                  <div className="src" key={trade.id}>
                    <PixelIcon name="trade" />
                    <div>
                      {profession.name} · {tier.name}
                      <div className="trade">
                        {trade.wants ? <Slot itemKey={trade.wants.key} count={trade.wants.max} /> : null}
                        <span className="onpanel">→</span>
                        {trade.gives ? <Slot itemKey={trade.gives.key} count={trade.gives.max} /> : null}
                      </div>
                    </div>
                    <span className="muted">×{trade.maxUses}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          {repairs.length ? (
            <>
              <h3 style={{ marginTop: 18 }}>Repairs</h3>
              <div className="taglist">{repairs.map((other) => <ItemLink key={other.key} itemKey={other.key} />)}</div>
            </>
          ) : null}
          {remainderOf.length ? (
            <>
              <h3 style={{ marginTop: 18 }}>Left behind by</h3>
              <div className="taglist">{remainderOf.map((other) => <ItemLink key={other.key} itemKey={other.key} />)}</div>
            </>
          ) : null}
          {criteria.length ? (
            <>
              <h3 style={{ marginTop: 18 }}>Advancements that ask for it</h3>
              <div className="taglist">
                {criteria.map((adv) => (
                  <a key={adv.id} className="btn small" href={advHref(adv.id, adv.tab)}>
                    {hidden(`advancement:${adv.id}`) ? "???" : adv.title}
                  </a>
                ))}
              </div>
            </>
          ) : null}
        </Panel>
      ) : null}
    </main>
  );
}
