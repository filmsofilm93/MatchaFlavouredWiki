import { useEffect, useMemo, useRef, useState } from "react";
import { ItemIcon, PixelIcon } from "../components/ui";
import { useWiki } from "../lib/data";
import { normalize } from "../lib/format";
import { advHref, href, itemHref, lootHref, structureHref } from "../lib/router";
import { useSpoilers } from "../lib/spoilers";

type Result = { key: string; label: string; kind: string; link: string; icon?: string; rank: number };

// Spoiler-safe: in Spoiler-free mode hidden entries never match.
export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const { data, ix } = useWiki();
  const { hidden } = useSpoilers();
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const results = useMemo(() => {
    const words = normalize(text);
    if (words.length < 2) return [];
    const out: Result[] = [];
    const score = (label: string) => {
      const value = normalize(label);
      if (value === words) return 0;
      if (value.startsWith(words)) return 1;
      if (value.includes(` ${words}`)) return 2;
      return value.includes(words) ? 3 : -1;
    };
    for (const item of data.items) {
      if (hidden(`item:${item.key}`)) continue;
      const rank = score(item.name);
      if (rank >= 0) out.push({ key: `i:${item.key}`, label: item.name, kind: item.custom ? "Pack item" : "Item", link: itemHref(item.key), icon: item.key, rank: rank + (item.custom ? 0 : 0.5) });
    }
    for (const entry of data.advancements) {
      if (hidden(`advancement:${entry.id}`)) continue;
      const rank = score(entry.title);
      if (rank >= 0) out.push({ key: `a:${entry.id}`, label: entry.title, kind: "Advancement", link: advHref(entry.id, entry.tab), icon: entry.iconKey || undefined, rank: rank + 0.2 });
    }
    for (const structure of data.structures) {
      if (hidden(`structure:${structure.id}`)) continue;
      const rank = score(structure.name);
      if (rank >= 0) out.push({ key: `s:${structure.id}`, label: structure.name, kind: "Structure", link: structureHref(structure.id), rank });
    }
    for (const table of data.loot) {
      if (hidden(`loot:${table.id}`) || !table.drops.length) continue;
      const rank = score(table.label);
      if (rank >= 0) out.push({ key: `l:${table.id}`, label: table.label, kind: `Loot · ${table.category}`, link: lootHref(table.id), rank: rank + 0.6 });
    }
    for (const [id, label] of [["route", "Main route"], ["recipes", "Recipes"], ["food", "Food"], ["gear", "Gear"], ["mechanics", "Mechanics"], ["places", "Where to find"], ["progress", "My progress"], ["changelog", "Changelog"]]) {
      const rank = score(label);
      if (rank >= 0) out.push({ key: `p:${id}`, label, kind: "Page", link: href(id), rank: rank - 0.5 });
    }
    return out.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label)).slice(0, 40);
  }, [text, data, hidden]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Search" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="panel notch">
        <input ref={input} type="search" placeholder="Search items, advancements, structures…" value={text} onChange={(event) => setText(event.target.value)} aria-label="Search" />
        <ul className="results">
          {results.map((result) => (
            <li key={result.key}>
              <a href={result.link} onClick={onClose}>
                {result.icon ? <ItemIcon item={ix.item.get(result.icon)} size={32} /> : <PixelIcon name="map" size={32} />}
                <span>{result.label}</span>
                <span className="kind">{result.kind}</span>
              </a>
            </li>
          ))}
        </ul>
        {text.length >= 2 && !results.length ? <p className="muted">Nothing found{/* spoiler-free */}.</p> : null}
        <p className="muted" style={{ margin: "9px 0 0" }}>
          Press Esc to close. In Spoiler-free mode, hidden entries are left out of results.
        </p>
      </div>
    </div>
  );
}
