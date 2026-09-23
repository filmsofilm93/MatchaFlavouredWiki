import { useMemo, useState } from "react";
import { EffectLine, Hearts, ItemIcon, Panel } from "../components/ui";
import { useWiki } from "../lib/data";
import { normalize, seconds } from "../lib/format";
import { itemHref } from "../lib/router";
import { useSpoilers } from "../lib/spoilers";

type Sort = "name" | "heal" | "time";

export function FoodPage() {
  const { data, ix } = useWiki();
  const { hidden } = useSpoilers();
  const [sort, setSort] = useState<Sort>("heal");
  const [station, setStation] = useState("all");
  const [text, setText] = useState("");
  const foods = useMemo(
    () =>
      data.items
        .filter((item) => item.consumable && (item.custom || item.renamed || item.consumable.effects.length))
        .map((item) => {
          const recipe = (ix.recipesByResult.get(item.key) || []).find((entry) => entry.origin !== "vanilla");
          return { item, station: recipe?.stationLabel || "", heal: item.consumable?.healsHp || 0 };
        }),
    [data.items, ix],
  );
  const stations = [...new Set(foods.map((entry) => entry.station).filter(Boolean))].sort();
  const words = normalize(text);
  const list = foods
    .filter((entry) => station === "all" || entry.station === station)
    .filter((entry) => !words || (!hidden(`item:${entry.item.key}`) && normalize(entry.item.name).includes(words)))
    .sort((a, b) => (sort === "heal" ? b.heal - a.heal : sort === "time" ? (a.item.consumable?.seconds || 0) - (b.item.consumable?.seconds || 0) : 0) || a.item.name.localeCompare(b.item.name));
  return (
    <main className="wide">
      <div className="pagehead">
        <span className="kicker">FOOD &amp; HEALING</span>
        <h1>Food</h1>
        <p>Meals heal through Regeneration. “Heals” is worked out from each effect's level and length (level n restores 1 health every 50÷2ⁿ⁻¹ ticks), so it matches the ❤ shown on the item.</p>
      </div>
      <div className="filters">
        <select value={station} onChange={(event) => setStation(event.target.value)} aria-label="Made at">
          <option value="all">Made anywhere</option>
          {stations.map((entry) => (
            <option key={entry}>{entry}</option>
          ))}
        </select>
        {(["heal", "name", "time"] as Sort[]).map((value) => (
          <button key={value} type="button" className="btn small" aria-pressed={sort === value} onClick={() => setSort(value)}>
            Sort by {value === "heal" ? "healing" : value === "time" ? "eat time" : "name"}
          </button>
        ))}
        <input type="search" placeholder="Find a food…" value={text} onChange={(event) => setText(event.target.value)} aria-label="Find a food" />
        <span className="onbg">{list.length} foods</span>
      </div>
      <Panel>
        <div className="scrollx">
          <table className="data">
            <thead>
              <tr>
                <th>Food</th>
                <th className="num">Heals</th>
                <th>Effects</th>
                <th className="num">Time</th>
                <th>Made at</th>
              </tr>
            </thead>
            <tbody>
              {list.map(({ item, station: made, heal }) => {
                const locked = hidden(`item:${item.key}`);
                return (
                  <tr key={item.key}>
                    <td>
                      <a className="itemlink" href={itemHref(item.key)} data-tip-item={item.key}>
                        {locked ? <span className="slot small locked" /> : <ItemIcon item={item} size={32} />}
                        <span>{locked ? "???" : item.name}</span>
                      </a>
                    </td>
                    <td className="num">{locked ? "?" : heal ? <Hearts hp={heal} /> : "–"}</td>
                    <td>
                      {locked
                        ? "?"
                        : item.consumable?.effects.filter((effect) => effect.id !== "minecraft:regeneration").map((effect, i) => (
                            <div key={i}>
                              <EffectLine effect={effect} />
                            </div>
                          ))}
                      {!locked && item.consumable?.other.length ? <div className="muted">{item.consumable.other.join(", ")}</div> : null}
                    </td>
                    <td className="num">{seconds(item.consumable?.seconds || 0)}</td>
                    <td>{made || <span className="muted">–</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </main>
  );
}
