import { useEffect, useMemo, useRef, useState } from "react";
import { ItemIcon, ItemLink, Locked, SecretBadge, Slot } from "../components/ui";
import { asset, orderedTabs, useWiki } from "../lib/data";
import { titleCase } from "../lib/format";
import { useProgress } from "../lib/progress";
import { href, itemHref, recipeHref, withQuery } from "../lib/router";
import { useSpoilers } from "../lib/spoilers";
import type { Advancement, WikiData } from "../lib/types";

const DX = 110;
const DY = 72;

// Tidy left-to-right tree: depth -> x, leaves stacked -> y.
export function layoutTab(data: WikiData, tabId: string) {
  const members = data.advancements.filter((entry) => entry.tab === tabId);
  const children = new Map<string, Advancement[]>();
  for (const entry of members) if (entry.parent) children.set(entry.parent, [...(children.get(entry.parent) || []), entry]);
  const pos = new Map<string, { x: number; y: number }>();
  let leaf = 0;
  const place = (entry: Advancement, depth: number): number => {
    const kids = children.get(entry.id) || [];
    let y: number;
    if (!kids.length) y = leaf++ * DY;
    else {
      const ys = kids.map((kid) => place(kid, depth + 1));
      y = (ys[0] + ys[ys.length - 1]) / 2;
    }
    pos.set(entry.id, { x: depth * DX + 50, y: y + 50 });
    return y;
  };
  const root = members.find((entry) => entry.id === tabId);
  if (root) place(root, 0);
  const width = Math.max(...[...pos.values()].map((p) => p.x)) + 80;
  const height = Math.max(...[...pos.values()].map((p) => p.y)) + 80;
  return { members, pos, width, height };
}

async function toDataUrl(url: string) {
  const blob = await fetch(url).then((response) => response.blob());
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export function AdvancementsPage({ query }: { query: URLSearchParams }) {
  const { data, ix } = useWiki();
  const { hidden, isSpoiler, mode } = useSpoilers();
  const { done, toggle } = useProgress();
  const tabId = query.get("tab") || orderedTabs(data)[0]?.id;
  const [selected, setSelected] = useState<string | null>(query.get("sel"));
  const layout = useMemo(() => layoutTab(data, tabId), [data, tabId]);
  const wrap = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 20, y: 20, k: 0.8 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  const fit = () => {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const room = rect.width > 800 ? rect.width - 420 : rect.width;
    const k = Math.min(1.2, room / layout.width, rect.height / layout.height);
    setView({ x: 10, y: Math.max(10, (rect.height - layout.height * k) / 2), k });
  };
  useEffect(fit, [layout]);
  useEffect(() => setSelected(query.get("sel")), [query]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      setView((v) => {
        const k = Math.min(2.5, Math.max(0.25, v.k * (event.deltaY < 0 ? 1.12 : 0.89)));
        return { x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k, k };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const nodeHidden = (entry: Advancement) => hidden(`advancement:${entry.id}`);
  const tabHidden = (id: string) => hidden(`advancement:${id}`);
  const current = selected ? ix.adv.get(selected) : null;

  const exportImage = async (format: "svg" | "png") => {
    const icons = new Map<string, string>();
    for (const entry of layout.members) {
      const item = entry.iconKey ? ix.item.get(entry.iconKey) : null;
      if (item?.texture && !nodeHidden(entry) && !icons.has(item.texture)) icons.set(item.texture, await toDataUrl(asset(item.texture)));
    }
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}"><rect width="100%" height="100%" fill="#3a2a1d"/>`;
    for (const entry of layout.members) {
      const parent = entry.parent && layout.pos.get(entry.parent);
      const p = layout.pos.get(entry.id)!;
      if (parent) {
        const mx = (parent.x + p.x) / 2;
        const d = `M${parent.x + 26} ${parent.y}H${mx}V${p.y}H${p.x - 26}`;
        svg += `<path d="${d}" stroke="#000" stroke-width="8" fill="none"/><path d="${d}" stroke="${nodeHidden(entry) ? "#8a7f92" : "#fff"}" stroke-width="3" fill="none"/>`;
      }
    }
    for (const entry of layout.members) {
      const p = layout.pos.get(entry.id)!;
      const locked = nodeHidden(entry);
      const fill = locked ? "#3b3440" : entry.frame === "goal" ? "#9bd06a" : entry.frame === "challenge" ? "#e0b64a" : "#c6c6c6";
      svg += `<rect x="${p.x - 26}" y="${p.y - 26}" width="52" height="52" rx="${entry.frame === "goal" ? 14 : 0}" fill="${fill}" stroke="#000" stroke-width="2"/>`;
      const item = entry.iconKey ? ix.item.get(entry.iconKey) : null;
      if (locked) svg += `<text x="${p.x}" y="${p.y + 8}" font-family="monospace" font-size="24" text-anchor="middle" fill="#d9c3f2">?</text>`;
      else if (item?.texture && icons.get(item.texture)) svg += `<image href="${icons.get(item.texture)}" x="${p.x - 16}" y="${p.y - 16}" width="32" height="32" style="image-rendering:pixelated" preserveAspectRatio="xMinYMin slice"/>`;
    }
    svg += "</svg>";
    const name = `matcha-advancements-${titleCase(tabId).replaceAll(" ", "-").toLowerCase()}-${mode}`;
    const download = (url: string, ext: string) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.${ext}`;
      a.click();
    };
    if (format === "svg") {
      download(URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), "svg");
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = layout.width * 2;
      canvas.height = layout.height * 2;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      download(canvas.toDataURL("image/png"), "png");
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  return (
    <main className="wide">
      <div className="pagehead">
        <span className="kicker">PROGRESSION · ADVANCEMENT MAP</span>
        <h1>Advancements</h1>
      </div>
      <div className="legend">
        <span><i className="lg" />Task</span>
        <span><i className="lg goal" />Goal</span>
        <span><i className="lg ch" />Challenge</span>
        <span><i className="lg sp" />Spoiler (locked)</span>
        <span>Drag to pan · wheel or buttons to zoom · click a node</span>
      </div>
      <div className="tabs" role="tablist">
        {orderedTabs(data).map((tab) => (
          <a key={tab.id} className="tab" role="tab" aria-selected={tab.id === tabId} href={withQuery(href("advancements"), { tab: tab.id })}>
            {tabHidden(tab.id) ? (
              <>
                <span className="slot small locked" />
                ???
              </>
            ) : (
              <>
                {tab.iconKey ? <ItemIcon item={ix.item.get(tab.iconKey)} size={24} /> : null}
                {tab.title}
              </>
            )}
          </a>
        ))}
      </div>
      <div className="advbox">
      <div
        className="advwrap"
        ref={wrap}
        onPointerDown={(event) => {
          if ((event.target as Element).closest(".node,.advpanel,.zoom")) return;
          drag.current = { x: event.clientX - view.x, y: event.clientY - view.y };
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const start = drag.current;
          setView((v) => ({ ...v, x: event.clientX - start.x, y: event.clientY - start.y }));
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <div className="advstage" style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.k})`, width: layout.width, height: layout.height }}>
          <svg className="lines" width={layout.width} height={layout.height} aria-hidden="true">
            {layout.members.map((entry) => {
              const parent = entry.parent && layout.pos.get(entry.parent);
              const p = layout.pos.get(entry.id);
              if (!parent || !p) return null;
              const mx = (parent.x + p.x) / 2;
              const d = `M${parent.x + 26} ${parent.y}H${mx}V${p.y}H${p.x - 26}`;
              return (
                <g key={entry.id}>
                  <path d={d} stroke="#000" strokeWidth={8} fill="none" />
                  <path d={d} stroke={nodeHidden(entry) ? "#8a7f92" : "#fff"} strokeWidth={3} fill="none" />
                </g>
              );
            })}
          </svg>
          {layout.members.map((entry) => {
            const p = layout.pos.get(entry.id)!;
            const locked = nodeHidden(entry);
            return (
              <button
                key={entry.id}
                type="button"
                className={`node ${entry.frame} ${locked ? "sp" : ""} ${selected === entry.id ? "sel" : ""}`}
                style={{ left: p.x, top: p.y }}
                aria-label={locked ? "Locked advancement" : entry.title}
                onClick={() => setSelected(entry.id)}
                data-tip-text={locked ? "???" : entry.title}
              >
                <span className="fr" />
                {!locked && entry.iconKey ? <ItemIcon item={ix.item.get(entry.iconKey)} size={32} /> : null}
                {!locked && mode === "full" && isSpoiler(`advancement:${entry.id}`) ? <span className="secretdot" title="secret" /> : null}
                {done.has(entry.id) ? <span className="donedot" title="done" /> : null}
              </button>
            );
          })}
        </div>
        <div className="zoom">
          <button type="button" className="btn small" aria-label="Zoom in" onClick={() => setView((v) => ({ ...v, k: Math.min(2.5, v.k * 1.2) }))}>+</button>
          <button type="button" className="btn small" aria-label="Zoom out" onClick={() => setView((v) => ({ ...v, k: Math.max(0.25, v.k / 1.2) }))}>-</button>
          <button type="button" className="btn small" onClick={fit}>Fit</button>
        </div>
      </div>
        <div className="advpanel panel notch">
          {current ? <AdvPanel entry={current} onSelect={setSelected} done={done.has(current.id)} toggle={() => toggle(current.id)} /> : (
            <>
              <span className="kicker">{tabHidden(tabId) ? "???" : ix.adv.get(tabId)?.title.toUpperCase()}</span>
              <h3>Click an advancement</h3>
              <p className="muted">
                {layout.members.length} advancements in this tab. {mode === "safe" ? `${layout.members.filter(nodeHidden).length} are locked in Spoiler-free mode.` : "Secret ones carry a purple dot."}
              </p>
            </>
          )}
        </div>
      </div>
      <div className="tools">
        <button type="button" className="btn small" onClick={() => exportImage("png")}>Export PNG</button>
        <button type="button" className="btn small" onClick={() => exportImage("svg")}>Export SVG</button>
        <span className="onbg">Exports use the current spoiler mode.</span>
      </div>
    </main>
  );
}

function AdvPanel({ entry, onSelect, done, toggle }: { entry: Advancement; onSelect: (id: string) => void; done: boolean; toggle: () => void }) {
  const { ix } = useWiki();
  const { hidden } = useSpoilers();
  const key = `advancement:${entry.id}`;
  if (hidden(key)) {
    return (
      <>
        <span className="kicker">LOCKED</span>
        <h3>???</h3>
        <Locked spoilerKey={key} />
      </>
    );
  }
  const kids = ix.advChildren.get(entry.id) || [];
  const parent = entry.parent ? ix.adv.get(entry.parent) : null;
  const mode = entry.requirements.length === 1 && entry.requirements[0].length > 1 ? "any one" : "all";
  return (
    <>
      <span className="kicker">
        {entry.frame.toUpperCase()}
        {entry.hidden ? " · HIDDEN" : ""}
      </span>{" "}
      <SecretBadge spoilerKey={key} />
      <h3>{entry.title}</h3>
      <p>{entry.description}</p>
      <label style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 9 }}>
        <input type="checkbox" className="check" checked={done} onChange={toggle} /> I've done this
      </label>
      <h3>Requirements ({mode})</h3>
      {entry.criteria.map((criterion) => (
        <div key={criterion.name} style={{ marginBottom: 6 }}>
          {criterion.items?.length ? (
            <div style={{ display: "flex", flexWrap: "wrap" }}>
              {criterion.items.slice(0, 12).map((key) => (
                <Slot key={key} itemKey={key} />
              ))}
            </div>
          ) : criterion.recipe && ix.recipe.get(criterion.recipe) ? (
            <div>
              Craft <a href={recipeHref(ix.recipe.get(criterion.recipe)!.slug)}>{ix.item.get(ix.recipe.get(criterion.recipe)!.result.key)?.name}</a>
            </div>
          ) : (
            <div className="muted">
              {titleCase(criterion.trigger)}
              {criterion.entities?.length ? `: ${criterion.entities.map(titleCase).join(", ")}` : ""}
              {criterion.structures?.length ? `: ${criterion.structures.map(titleCase).join(", ")}` : ""}
              {criterion.dimension?.to ? `: ${titleCase(criterion.dimension.to)}` : ""}
              {criterion.effects?.length ? `: ${criterion.effects.map(titleCase).join(", ")}` : ""}
            </div>
          )}
        </div>
      ))}
      {entry.rewards.experience || entry.rewards.loot.length ? (
        <>
          <h3 style={{ marginTop: 12 }}>Rewards</h3>
          {entry.rewards.experience ? <div>{entry.rewards.experience} XP</div> : null}
          {entry.rewards.loot.map((table) => (
            <div key={table} className="taglist">
              {(ix.loot.get(table)?.drops || []).slice(0, 6).map((drop) => (
                <ItemLink key={drop.key} itemKey={drop.key} />
              ))}
            </div>
          ))}
        </>
      ) : null}
      <h3 style={{ marginTop: 12 }}>Recipe book unlocks</h3>
      {entry.unlocks.length ? (
        <div className="taglist">
          {entry.unlocks.slice(0, 16).map((id) => {
            const recipe = ix.recipe.get(id);
            return recipe ? <ItemLink key={id} itemKey={recipe.result.key} /> : null;
          })}
          {entry.unlocks.length > 16 ? <span className="muted">+{entry.unlocks.length - 16} more</span> : null}
        </div>
      ) : (
        <p className="muted">No recipe-book unlocks are triggered by this.</p>
      )}
      <h3 style={{ marginTop: 12 }}>Next steps</h3>
      {kids.length ? (
        kids.map((kid) => (
          <button key={kid.id} type="button" className="btn small" style={{ margin: 2 }} onClick={() => onSelect(kid.id)}>
            {hidden(`advancement:${kid.id}`) ? "???" : kid.title}
          </button>
        ))
      ) : (
        <p className="muted">End of this branch.</p>
      )}
      {parent ? <p className="muted" style={{ marginTop: 9 }}>After: {hidden(`advancement:${parent.id}`) ? "???" : parent.title}</p> : null}
      {entry.iconKey ? (
        <p style={{ margin: 0 }}>
          <a href={itemHref(entry.iconKey)}>Icon item</a>
        </p>
      ) : null}
    </>
  );
}
