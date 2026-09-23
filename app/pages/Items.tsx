import { useMemo, useState } from "react";
import { ItemIcon, Panel } from "../components/ui";
import { useWiki } from "../lib/data";
import { normalize } from "../lib/format";
import { href, itemHref, withQuery } from "../lib/router";
import { useSpoilers } from "../lib/spoilers";
import type { Item } from "../lib/types";

export const itemCategories: [string, string, (item: Item) => boolean][] = [
  ["custom", "Pack items", (item) => item.custom || item.renamed],
  ["food", "Food & drink", (item) => Boolean(item.food || item.consumable)],
  ["tools", "Tools & weapons", (item) => Boolean(item.tool || item.weapon || item.attributes?.some((a) => /attack/.test(a.attribute)))],
  ["armour", "Armour", (item) => Boolean(item.slot && item.slot !== "mainhand" && item.slot !== "offhand")],
  ["fish", "Fish", () => false],
  ["all", "Everything", () => true],
];

const PAGE = 240;

export function ItemsPage({ query }: { query: URLSearchParams }) {
  const { data, ix } = useWiki();
  const { hidden } = useSpoilers();
  const [text, setText] = useState(query.get("q") || "");
  const [limit, setLimit] = useState(PAGE);
  const category = query.get("cat") || "custom";
  const list = useMemo(() => {
    const test = itemCategories.find(([id]) => id === category)?.[2] || (() => true);
    const words = normalize(text);
    return data.items.filter((item) => {
      if (category === "fish" ? !ix.fish.has(item.key) : !test(item)) return false;
      if (!words) return true;
      // Spoiler-free search never matches a hidden item's name.
      if (hidden(`item:${item.key}`)) return false;
      return normalize(`${item.name} ${item.key}`).includes(words);
    });
  }, [data.items, ix.fish, category, text, hidden]);
  return (
    <main className="wide">
      <div className="pagehead">
        <span className="kicker">ITEMS</span>
        <h1>Items</h1>
        <p>Every item the pack adds or renames, plus every vanilla item its recipes, loot and trades use.</p>
      </div>
      <div className="filters">
        {itemCategories.map(([id, label]) => (
          <a key={id} className="btn small" href={withQuery(href("items"), { cat: id })} aria-current={category === id ? "page" : undefined}>
            {label}
          </a>
        ))}
        <input type="search" placeholder="Filter by name…" value={text} onChange={(event) => setText(event.target.value)} aria-label="Filter items" />
        <span className="onbg">{list.length} items</span>
      </div>
      <Panel>
        <div className="itemgrid">
          {list.slice(0, limit).map((item) => {
            const locked = hidden(`item:${item.key}`);
            return (
              <a key={item.key} className="itemrow" href={itemHref(item.key)} data-tip-item={item.key} data-locked={locked ? "1" : undefined}>
                {locked ? <span className="slot small locked" /> : <ItemIcon item={item} size={32} />}
                <span className="name">{locked ? "???" : item.name}</span>
              </a>
            );
          })}
        </div>
        {list.length > limit ? (
          <div className="pager">
            <button type="button" className="btn small" onClick={() => setLimit(limit + PAGE)}>
              Show more ({list.length - limit} left)
            </button>
          </div>
        ) : null}
      </Panel>
    </main>
  );
}
