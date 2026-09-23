import { Chance, Empty, ItemLink, Locked, Panel, Slot } from "../components/ui";
import { useWiki } from "../lib/data";
import { percent, range } from "../lib/format";
import { advHref, href, lootHref, structureHref } from "../lib/router";
import { useSpoilers } from "../lib/spoilers";

export function LootPage({ id }: { id: string }) {
  const { ix } = useWiki();
  const { hidden } = useSpoilers();
  const table = ix.loot.get(id);
  if (!table) {
    return (
      <main>
        <h1>Unknown loot table</h1>
        <p className="onbg">
          <a href={href("places", "loot")}>All loot tables</a>
        </p>
      </main>
    );
  }
  const key = `loot:${table.id}`;
  const structures = ix.structuresByTable.get(table.id) || [];
  const parents = ix.tableParents.get(table.id) || [];
  const rewards = ix.rewardAdvsByTable.get(table.id) || [];
  return (
    <main>
      <p className="onbg">
        <a href={href("places", "loot")} style={{ color: "#55ffff" }}>
          ← Loot tables
        </a>
      </p>
      <Panel kicker={`${table.origin === "pack" ? "PACK" : "MINECRAFT"} · ${table.category.toUpperCase()}`} title={hidden(key) ? "???" : table.label}>
        <p>
          <code>{table.id}</code>
        </p>
        {structures.length ? (
          <p>
            Found in:{" "}
            {structures.map((structure, i) => (
              <span key={structure.id}>
                {i ? ", " : ""}
                {hidden(`structure:${structure.id}`) ? "???" : <a href={structureHref(structure.id)}>{structure.name}</a>}
              </span>
            ))}
          </p>
        ) : null}
        {parents.length ? (
          <p>
            Rolled by:{" "}
            {parents.map((parent, i) => (
              <span key={parent}>
                {i ? ", " : ""}
                <a href={lootHref(parent)}>{ix.loot.get(parent)?.label || parent}</a>
              </span>
            ))}
          </p>
        ) : null}
        {rewards.length ? (
          <p>
            Advancement reward for:{" "}
            {rewards.map((adv, i) => (
              <span key={adv.id}>
                {i ? ", " : ""}
                {hidden(`advancement:${adv.id}`) ? "???" : <a href={advHref(adv.id, adv.tab)}>{adv.title}</a>}
              </span>
            ))}
          </p>
        ) : null}
        {hidden(key) ? <Locked spoilerKey={key} /> : null}
      </Panel>
      {!hidden(key) ? (
        <>
          <Panel kicker="CHANCE PER OPEN / KILL / CATCH" title="What it gives">
            {table.drops.length ? null : <Empty>This table gives nothing on its own.</Empty>}
            <div className="srcs">
              {table.drops.map((drop) => (
                <div key={drop.key} className="src">
                  <Slot itemKey={drop.key} />
                  <div>
                    <ItemLink itemKey={drop.key} /> <span className="sub">· {range(drop.min, drop.max)} each</span>
                    {drop.conditions?.length ? <div className="sub">Only when: {drop.conditions.join("; ")}</div> : null}
                    {drop.notes?.length ? <div className="sub">{drop.notes.join("; ")}</div> : null}
                  </div>
                  <Chance p={drop.chance} />
                </div>
              ))}
            </div>
          </Panel>
          <Panel kicker="POOLS" title="How it rolls">
            {table.pools.map((pool, i) => (
              <div key={i} className="pool">
                <h3>
                  Pool {i + 1}: {pool.rolls.length === 1 ? pool.rolls[0] : `${pool.rolls[0]}–${pool.rolls[1]}`} roll{pool.rolls.length === 1 && pool.rolls[0] === 1 ? "" : "s"}
                  {pool.chance !== undefined ? ` · ${percent(pool.chance)} chance` : ""}
                  {pool.conditions?.length ? ` · when ${pool.conditions.join("; ")}` : ""}
                </h3>
                <div className="scrollx">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Entry</th>
                        <th className="num">Weight</th>
                        <th className="num">Per roll</th>
                        <th className="num">Count</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pool.entries.map((entry, j) => (
                        <tr key={j}>
                          <td>
                            {entry.key ? <ItemLink itemKey={entry.key} /> : entry.table ? <a href={lootHref(entry.table)}>{ix.loot.get(entry.table)?.label || entry.table}</a> : entry.tag ? <code>#{entry.tag}</code> : entry.type === "empty" ? <span className="muted">Nothing</span> : <span className="muted">{entry.type}</span>}
                          </td>
                          <td className="num">{entry.weight}</td>
                          <td className="num">{percent(entry.perRoll)}</td>
                          <td className="num">{entry.count ? range(entry.count[0], entry.count[1]) : 1}</td>
                          <td>
                            {[...(entry.conditions || []), ...(entry.conditionChance !== undefined ? [`${percent(entry.conditionChance)} condition`] : []), ...(entry.notes || [])].join("; ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </Panel>
        </>
      ) : null}
    </main>
  );
}
