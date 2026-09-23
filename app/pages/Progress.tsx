import { useRef } from "react";
import { ItemIcon, Panel } from "../components/ui";
import { orderedTabs, useWiki } from "../lib/data";
import { useProgress } from "../lib/progress";
import { advHref } from "../lib/router";
import { useSpoilers } from "../lib/spoilers";

export function ProgressPage() {
  const { data, ix } = useWiki();
  const { hidden } = useSpoilers();
  const { done, toggle, replace } = useProgress();
  const file = useRef<HTMLInputElement>(null);
  const exportProgress = () => {
    const blob = new Blob([JSON.stringify({ version: data.release.version, done: [...done] }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "matcha-progress.json";
    a.click();
  };
  const importProgress = async (list: FileList | null) => {
    const text = await list?.[0]?.text();
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed.done)) replace(parsed.done.filter((id: unknown) => typeof id === "string"));
    } catch {
      alert("That file is not a progress export.");
    }
  };
  return (
    <main>
      <div className="pagehead">
        <span className="kicker">MY PROGRESS</span>
        <h1>My progress</h1>
        <p>Tick off advancements as you play. Progress is saved in this browser only; export it to move it to another device.</p>
      </div>
      <div className="tools">
        <button type="button" className="btn small" onClick={exportProgress}>Export</button>
        <button type="button" className="btn small" onClick={() => file.current?.click()}>Import</button>
        <input ref={file} type="file" accept="application/json" hidden onChange={(event) => importProgress(event.target.files)} />
        <button type="button" className="btn small" onClick={() => confirm("Clear all ticked advancements?") && replace([])}>Reset</button>
      </div>
      {orderedTabs(data).map((tab) => {
        const members = data.advancements.filter((entry) => entry.tab === tab.id);
        const count = members.filter((entry) => done.has(entry.id)).length;
        const tabLocked = hidden(`advancement:${tab.id}`);
        return (
          <Panel key={tab.id} kicker={`${count} / ${members.length}`} title={tabLocked ? "???" : tab.title}>
            <div className="progressbar" aria-hidden="true">
              <i style={{ width: `${(count / Math.max(1, members.length)) * 100}%` }} />
            </div>
            <details>
              <summary>Advancements</summary>
              <ul className="checklist">
                {members.map((entry) => {
                  const locked = hidden(`advancement:${entry.id}`);
                  return (
                    <li key={entry.id}>
                      <input type="checkbox" id={`p-${entry.id}`} checked={done.has(entry.id)} onChange={() => toggle(entry.id)} />
                      <label htmlFor={`p-${entry.id}`} style={{ display: "flex", gap: 9, alignItems: "center" }}>
                        {!locked && entry.iconKey ? <ItemIcon item={ix.item.get(entry.iconKey)} size={24} /> : null}
                        <span>{locked ? "??? (hidden)" : entry.title}</span>
                        {!locked ? <a href={advHref(entry.id, entry.tab)} className="muted">map</a> : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </details>
          </Panel>
        );
      })}
    </main>
  );
}
