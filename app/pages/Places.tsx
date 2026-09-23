import { useMemo, useState } from "react";
import { Chance, Empty, ItemLink, Locked, Panel, PixelIcon, SecretBadge, Slot } from "../components/ui";
import { useWiki } from "../lib/data";
import { dimensionName, normalize, range, titleCase } from "../lib/format";
import { href, lootHref, structureHref } from "../lib/router";
import { useSpoilers } from "../lib/spoilers";
import type { LootTable, Ore, Structure } from "../lib/types";

const sections: [string, string][] = [
  ["structures", "Structures"],
  ["ores", "Ores"],
  ["mobs", "Mob drops"],
  ["fishing", "Fishing"],
  ["trades", "Trades"],
  ["archaeology", "Archaeology"],
  ["loot", "All loot tables"],
];

export function PlacesPage({ sub, query }: { sub?: string; query: URLSearchParams }) {
  const section = sub && sections.some(([id]) => id === sub) ? sub : sub ? "structure" : "structures";
  return (
    <main className="wide">
      <div className="pagehead">
        <span className="kicker">WHERE TO FIND IT</span>
        <h1>Where to find it</h1>
        <p>Structures, ore veins, mobs, fishing and trades, all read from the pack. Chances are per chest opened, mob killed or fish caught.</p>
      </div>
      <div className="filters">
        {sections.map(([id, label]) => (
          <a key={id} className="btn small" href={href("places", id === "structures" ? undefined : id)} aria-current={section === id ? "page" : undefined}>
            {label}
          </a>
        ))}
      </div>
      {section === "structures" ? <Structures /> : null}
      {section === "structure" && sub ? <StructurePage id={sub} /> : null}
      {section === "ores" ? <Ores /> : null}
      {section === "mobs" ? <TableList category="entities" per="per kill" query={query} /> : null}
      {section === "archaeology" ? <TableList category="archaeology" per="per brush" query={query} /> : null}
      {section === "loot" ? <TableList category="*" per="" query={query} /> : null}
      {section === "fishing" ? <Fishing /> : null}
      {section === "trades" ? <Trades /> : null}
    </main>
  );
}

function StructureName({ structure }: { structure: Structure }) {
  const { hidden } = useSpoilers();
  return hidden(`structure:${structure.id}`) ? <>???</> : <>{structure.name}</>;
}

function Structures() {
  const { data } = useWiki();
  const withLoot = data.structures.filter((structure) => structure.lootTables.length || structure.vaults.length || structure.fixedItems.length || structure.byPack);
  const pack = withLoot.filter((structure) => structure.byPack);
  const vanilla = withLoot.filter((structure) => !structure.byPack);
  const card = (structure: Structure) => (
    <a key={structure.id} className="card panel notch" href={structureHref(structure.id)}>
      <div className="row">
        <PixelIcon name="map" />
        <div>
          <div style={{ color: "var(--ink-2)" }}>
            <StructureName structure={structure} />
          </div>
          <div className="muted">
            {structure.lootTables.length} loot tables{structure.vaults.length ? ` · ${structure.vaults.length} vault types` : ""}
            {structure.fixedItems.length ? ` · ${structure.fixedItems.length} placed items` : ""}
          </div>
        </div>
      </div>
    </a>
  );
  return (
    <>
      <h2 className="onbg">Added or changed by the pack</h2>
      <div className="cards" style={{ marginBottom: 27 }}>{pack.map(card)}</div>
      <h2 className="onbg">Minecraft structures</h2>
      <div className="cards">{vanilla.map(card)}</div>
    </>
  );
}

function TableSummary({ table, limit = 10 }: { table: LootTable; limit?: number }) {
  const { hidden } = useSpoilers();
  const visible = table.drops.slice(0, limit);
  return (
    <div className="srcs">
      {visible.map((drop) => (
        <div key={drop.key} className="src">
          <Slot itemKey={drop.key} />
          <div>
            <ItemLink itemKey={drop.key} /> <span className="sub">· {range(drop.min, drop.max)} each</span>
            {drop.conditions?.length ? <div className="sub">{drop.conditions.join("; ")}</div> : null}
            {drop.notes?.length && !hidden(`item:${drop.key}`) ? <div className="sub">{drop.notes.join("; ")}</div> : null}
          </div>
          <Chance p={drop.chance} />
        </div>
      ))}
      {table.drops.length > limit ? (
        <p className="muted" style={{ margin: 0 }}>
          …and {table.drops.length - limit} more. <a href={lootHref(table.id)}>Full table</a>
        </p>
      ) : null}
    </div>
  );
}

function StructurePage({ id }: { id: string }) {
  const { data, ix } = useWiki();
  const { hidden } = useSpoilers();
  const structure = data.structures.find((entry) => entry.id === id);
  if (!structure) return <Empty>Unknown structure {id}.</Empty>;
  const key = `structure:${structure.id}`;
  if (hidden(key)) {
    return (
      <Panel title="???">
        <Locked spoilerKey={key} />
      </Panel>
    );
  }
  const biomeNames = structure.biomes.map((biome) => data.worldgen.biomes.find((entry) => entry.id === biome)?.name || titleCase(biome));
  return (
    <>
      <Panel kicker={structure.byPack ? "CHANGED OR ADDED BY THE PACK" : "MINECRAFT STRUCTURE"} title={<>{structure.name} <SecretBadge spoilerKey={key} /></>}>
        <dl className="facts">
          <dt>Type</dt>
          <dd>{titleCase(structure.type)}{structure.templates ? ` · built from ${structure.templates} pieces` : ""}</dd>
          <dt>Biomes</dt>
          <dd>{biomeNames.length ? `${biomeNames.slice(0, 12).join(", ")}${biomeNames.length > 12 ? ` and ${biomeNames.length - 12} more` : ""}` : "Needs verification"}</dd>
          {structure.placement ? (
            <>
              <dt>Spacing</dt>
              <dd>
                One per {structure.placement.spacing ?? "?"} chunks (at least {structure.placement.separation ?? "?"} apart){structure.placement.frequency && structure.placement.frequency < 1 ? `, ${Math.round(structure.placement.frequency * 100)}% chance` : ""}
              </dd>
            </>
          ) : null}
          {structure.spawners.length ? (
            <>
              <dt>Spawners</dt>
              <dd>{structure.spawners.map((spawner) => `${spawner.name} ×${spawner.count}`).join(", ")}</dd>
            </>
          ) : null}
          {structure.entities.length ? (
            <>
              <dt>Mobs placed</dt>
              <dd>{structure.entities.map((entity) => `${entity.name} ×${entity.count}`).join(", ")}</dd>
            </>
          ) : null}
        </dl>
      </Panel>
      {structure.lootTables.map((entry) => {
        const table = ix.loot.get(entry.table);
        return (
          <Panel key={entry.table} kicker={entry.fromCode ? "CHESTS (placed by Minecraft's code)" : `CONTAINERS: ${entry.containers}`} title={<a href={lootHref(entry.table)}>{table?.label || entry.table}</a>}>
            {entry.templates.length ? <p className="muted">In: {entry.templates.slice(0, 6).map((template) => titleCase(template.split("/").slice(-1)[0])).join(", ")}{entry.templates.length > 6 ? "…" : ""}</p> : null}
            {table ? <TableSummary table={table} /> : <Empty>This table is not in the data (needs verification).</Empty>}
          </Panel>
        );
      })}
      {structure.vaults.length ? (
        <Panel kicker="VAULTS" title="Vaults">
          {structure.vaults.map((vault, i) => {
            const table = ix.loot.get(vault.table);
            return (
              <div key={i} style={{ marginBottom: 18 }}>
                <h3>
                  {vault.ominous ? "Ominous vault" : "Vault"} ×{vault.count}
                </h3>
                {vault.key ? (
                  <p>
                    Opens with <ItemLink itemKey={vault.key} />
                  </p>
                ) : null}
                {table ? <TableSummary table={table} /> : <code>{vault.table}</code>}
              </div>
            );
          })}
        </Panel>
      ) : null}
      {structure.fixedItems.length ? (
        <Panel kicker="PLACED ITEMS" title="Always there">
          <p className="muted">Items the structure's pieces contain directly (item frames, fixed chest contents), not random loot.</p>
          <div className="taglist">
            {structure.fixedItems.map((fixed) => (
              <ItemLink key={fixed.key} itemKey={fixed.key} count={fixed.count} />
            ))}
          </div>
        </Panel>
      ) : null}
    </>
  );
}

function OreChart({ ore, bounds }: { ore: Ore; bounds: { minY: number; maxY: number } }) {
  if (!ore.height || ore.height.min === null || ore.height.max === null) return null;
  const span = bounds.maxY - bounds.minY;
  const clamp = (y: number) => Math.min(bounds.maxY, Math.max(bounds.minY, y));
  const top = ((bounds.maxY - clamp(ore.height.max)) / span) * 100;
  const bottom = ((bounds.maxY - clamp(ore.height.min)) / span) * 100;
  const peak = ore.height.shape === "trapezoid" ? (ore.height.min + ore.height.max) / 2 : null;
  return (
    <span className="orechart" style={{ display: "block", height: 120, width: 60 }} aria-hidden="true">
      <span className="band" style={{ left: 20, top: `${top}%`, height: `${Math.max(2, bottom - top)}%`, background: ore.height.shape === "trapezoid" ? "linear-gradient(transparent, #55ff55, transparent)" : "#55ff55" }} />
      {peak !== null ? <span className="band" style={{ left: 16, width: 26, height: 4, top: `${((bounds.maxY - clamp(peak)) / span) * 100}%`, background: "#fff" }} /> : null}
    </span>
  );
}

function Ores() {
  const { data } = useWiki();
  const [dimension, setDimension] = useState("overworld");
  const ores = data.worldgen.ores.filter((ore) => ore.dimension === dimension && ore.targets.length);
  const bounds = data.worldgen.bounds[dimension];
  return (
    <>
      <div className="filters">
        {Object.keys(data.worldgen.bounds).map((id) => (
          <button key={id} type="button" className="btn small" aria-pressed={dimension === id} onClick={() => setDimension(id)}>
            {dimensionName[id] || titleCase(id)}
          </button>
        ))}
      </div>
      <Panel kicker={`${(dimensionName[dimension] || dimension).toUpperCase()} · Y ${bounds.minY} TO ${bounds.maxY}`} title="Ore veins">
        <p className="muted">
          Heights come from each vein's placement. A trapezoid is most common at its middle (white mark) and thins towards both ends; its ends can lie outside the world, which only changes how steeply it thins.
        </p>
        <div className="scrollx">
          <table className="data">
            <thead>
              <tr>
                <th>Block</th>
                <th>Height</th>
                <th className="num">Y range</th>
                <th className="num">Veins / chunk</th>
                <th className="num">Vein size</th>
                <th>Biomes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ores.map((ore) => (
                <tr key={ore.id}>
                  <td>
                    <div className="taglist">
                      {ore.targets.map((target) => (
                        <ItemLink key={target.block} itemKey={target.key} />
                      ))}
                    </div>
                  </td>
                  <td>
                    <OreChart ore={ore} bounds={bounds} />
                  </td>
                  <td className="num">
                    {ore.height ? `${ore.height.min} to ${ore.height.max}` : "?"}
                    <div className="muted">{ore.height ? titleCase(ore.height.shape) : ""}</div>
                  </td>
                  <td className="num">
                    {range(ore.perChunk.min, ore.perChunk.max)}
                    {ore.rarity ? <div className="muted">in {Math.round(ore.rarity * 100)}% of chunks</div> : null}
                  </td>
                  <td className="num">
                    {ore.size}
                    {ore.airExposureDiscard ? <div className="muted">{Math.round(ore.airExposureDiscard * 100)}% less near air</div> : null}
                  </td>
                  <td>{ore.biomeCount}</td>
                  <td>{ore.byPack ? <span className="badge">pack</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function TableList({ category, per, query }: { category: string; per: string; query: URLSearchParams }) {
  const { data } = useWiki();
  const { hidden } = useSpoilers();
  const [text, setText] = useState(query.get("q") || "");
  const tables = useMemo(
    () => data.loot.filter((table) => (category === "*" || table.category === category) && table.drops.length),
    [data.loot, category],
  );
  const words = normalize(text);
  const list = tables.filter((table) => !words || normalize(`${table.label} ${table.id}`).includes(words));
  return (
    <>
      <div className="filters">
        <input type="search" placeholder="Filter…" value={text} onChange={(event) => setText(event.target.value)} aria-label="Filter tables" />
        <span className="onbg">{list.length} tables {per ? `· chances ${per}` : ""}</span>
      </div>
      <div className="grid2">
        {list.slice(0, 80).map((table) => (
          <Panel key={table.id} kicker={table.origin === "pack" ? "PACK" : "MINECRAFT"} title={<a href={lootHref(table.id)}>{hidden(`loot:${table.id}`) ? "???" : table.label}</a>}>
            {hidden(`loot:${table.id}`) ? <Locked spoilerKey={`loot:${table.id}`} /> : <TableSummary table={table} limit={6} />}
          </Panel>
        ))}
      </div>
      {list.length > 80 ? <p className="onbg">Showing 80 of {list.length}; filter to narrow it down.</p> : null}
    </>
  );
}

function Fishing() {
  const { data } = useWiki();
  const tiers = [...new Set(data.fish.map((fish) => fish.stars))].sort();
  const tables = data.loot.filter((table) => table.category === "fishing" && table.drops.length && table.id.split("/").length <= 3);
  return (
    <>
      {tiers.map((stars) => {
        const list = data.fish.filter((fish) => fish.stars === stars);
        return (
          <Panel key={stars} kicker={`${"★".repeat(stars)} ${list[0].tier.toUpperCase()}`} title={`${list[0].tier} fish (${list.length})`}>
            <p className="muted">The fisherman buys these at level {list[0].level}, {list[0].sells} at a time.</p>
            <div className="taglist">
              {list.map((fish) => (
                <ItemLink key={fish.key} itemKey={fish.key} />
              ))}
            </div>
          </Panel>
        );
      })}
      <h2 className="onbg">Fishing tables by water</h2>
      <div className="grid2">
        {tables.map((table) => (
          <Panel key={table.id} title={<a href={lootHref(table.id)}>{table.label}</a>}>
            <TableSummary table={table} limit={8} />
          </Panel>
        ))}
      </div>
    </>
  );
}

function Trades() {
  const { data, ix } = useWiki();
  const [profession, setProfession] = useState(data.trades.professions[0]?.id);
  const current = data.trades.professions.find((entry) => entry.id === profession);
  return (
    <>
      <div className="filters">
        {data.trades.professions.map((entry) => (
          <button key={entry.id} type="button" className="btn small" aria-pressed={entry.id === profession} onClick={() => setProfession(entry.id)}>
            {entry.name}
          </button>
        ))}
      </div>
      {current?.tiers.map((tier) => (
        <Panel key={tier.id} kicker={`${tier.name.toUpperCase()} · OFFERS ${tier.amount} OF ${tier.trades.length}${tier.duplicates ? " (REPEATS ALLOWED)" : ""}`}>
          <div className="srcs">
            {tier.trades.map((id) => {
              const ref = ix.tradeRef.get(id);
              if (!ref) return null;
              const { trade } = ref;
              return (
                <div key={id} className="src">
                  <PixelIcon name="trade" />
                  <div className="trade">
                    {trade.wants ? <Slot itemKey={trade.wants.key} count={trade.wants.max} /> : null}
                    {trade.alsoWants ? <Slot itemKey={trade.alsoWants.key} count={trade.alsoWants.max} /> : null}
                    <span>→</span>
                    {trade.gives ? <Slot itemKey={trade.gives.key} count={trade.gives.max} /> : null}
                    <span>
                      {trade.gives ? <ItemLink itemKey={trade.gives.key} /> : null}
                      {trade.gives && trade.gives.min !== trade.gives.max ? <span className="muted"> ({range(trade.gives.min, trade.gives.max)})</span> : null}
                      {trade.notes?.length ? <span className="sub"> · {trade.notes.join("; ")}</span> : null}
                    </span>
                  </div>
                  <span className="muted">
                    ×{trade.maxUses} · {trade.xp} XP
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      ))}
    </>
  );
}
