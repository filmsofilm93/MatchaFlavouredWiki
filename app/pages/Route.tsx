import { Fragment } from "react";
import { RecipeGui } from "../components/RecipeGui";
import { ItemIcon, Locked, SecretBadge, Slot } from "../components/ui";
import { useWiki, type Indexes } from "../lib/data";
import { titleCase } from "../lib/format";
import { advHref } from "../lib/router";
import { useSpoilers } from "../lib/spoilers";
import type { Advancement, Recipe, WikiData } from "../lib/types";

const lateMarker = /(^|\/)(enter_nether|find_stronghold|enter_end|kill_dragon)$/;

// The route through each progression tab: root -> its latest milestone
// (or its deepest advancement), in the order the tabs are played.
export function routeOf(data: WikiData, ix: Indexes) {
  const tabs = data.tabs.filter((tab) => !/almanac|with_songs/.test(tab.id));
  const main = tabs.find((tab) => /tutorial|story/.test(tab.id)) || [...tabs].sort((a, b) => b.count - a.count)[0];
  const ordered = [main, ...tabs.filter((tab) => tab !== main).sort((a, b) => b.count - a.count)].filter(Boolean);
  const depth = (entry: Advancement) => {
    let d = 0;
    let current: Advancement | undefined = entry;
    while (current?.parent && ix.adv.has(current.parent)) {
      d += 1;
      current = ix.adv.get(current.parent);
    }
    return d;
  };
  return ordered.map((tab) => {
    const members = data.advancements.filter((entry) => entry.tab === tab.id);
    const markers = members.filter((entry) => lateMarker.test(entry.id));
    const pool = markers.length ? markers : members;
    const target = [...pool].sort((a, b) => depth(b) - depth(a))[0];
    const spine: Advancement[] = [];
    let current: Advancement | undefined = target;
    while (current) {
      spine.unshift(current);
      current = current.parent ? ix.adv.get(current.parent) : undefined;
    }
    return { tab, spine };
  });
}

// The recipe that completes an advancement, if one does.
export function recipeFor(entry: Advancement, ix: Indexes): Recipe | null {
  for (const criterion of entry.criteria) {
    if (criterion.recipe && ix.recipe.get(criterion.recipe)) return ix.recipe.get(criterion.recipe)!;
  }
  const targets = entry.criteria.flatMap((criterion) => criterion.items || []);
  for (const key of targets) {
    const made = (ix.recipesByResult.get(key) || []).sort((a, b) => (a.origin === "vanilla" ? 1 : 0) - (b.origin === "vanilla" ? 1 : 0));
    if (made[0]) return made[0];
  }
  return null;
}

function Step({ entry }: { entry: Advancement }) {
  const { ix } = useWiki();
  const { hidden } = useSpoilers();
  const key = `advancement:${entry.id}`;
  if (hidden(key)) {
    return (
      <div className="step sp notch">
        <h3>???</h3>
        <Locked spoilerKey={key} compact />
      </div>
    );
  }
  const recipe = recipeFor(entry, ix);
  const targets = [...new Set(entry.criteria.flatMap((criterion) => criterion.items || []))];
  const trigger = entry.criteria[0]?.trigger;
  return (
    <div className="step notch">
      <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
        {entry.iconKey ? <ItemIcon item={ix.item.get(entry.iconKey)} size={32} /> : null}
        <h3>
          <a href={advHref(entry.id, entry.tab)}>{entry.title}</a>
        </h3>
        <SecretBadge spoilerKey={key} />
      </div>
      <div className="d">{entry.description}</div>
      {recipe ? (
        <RecipeGui recipe={recipe} />
      ) : (
        <>
          {targets.length ? (
            <div className="io">
              {targets.slice(0, 6).map((target) => (
                <Slot key={target} itemKey={target} />
              ))}
            </div>
          ) : null}
          {trigger ? <span className="st">{titleCase(trigger)}</span> : null}
        </>
      )}
    </div>
  );
}

export function RoutePage() {
  const { data, ix } = useWiki();
  const { hidden } = useSpoilers();
  const route = routeOf(data, ix);
  return (
    <main>
      <div className="pagehead">
        <span className="kicker">PROGRESSION · MAIN ROUTE</span>
        <h1>Start to finish</h1>
        <p>Each step is an in-game advancement, shown with the exact recipe that completes it. Side branches open under the step they start from.</p>
      </div>
      <div className="stonebg">
        <div className="route">
          {route.map(({ tab, spine }, tabIndex) => (
            <Fragment key={tab.id}>
              <div className="tabdivider">{hidden(`advancement:${tab.id}`) ? "??? tab" : `${tab.title} tab`}</div>
              {spine.map((entry, i) => {
                const spineIds = new Set(spine.map((step) => step.id));
                const branches = (ix.advChildren.get(entry.id) || []).filter((kid) => !spineIds.has(kid.id));
                const visible = branches.filter((kid) => !hidden(`advancement:${kid.id}`));
                return (
                  <Fragment key={entry.id}>
                    <Step entry={entry} />
                    {branches.length ? (
                      <details className="step notch" style={{ marginTop: 6, background: "#b0b0b0" }}>
                        <summary>
                          Side branches: {visible.length}
                          {branches.length > visible.length ? ` (+${branches.length - visible.length} locked)` : ""}
                        </summary>
                        <div style={{ display: "grid", gap: 9, marginTop: 9 }}>
                          {branches.map((kid) => (
                            <Step key={kid.id} entry={kid} />
                          ))}
                        </div>
                      </details>
                    ) : null}
                    {i < spine.length - 1 || tabIndex < route.length - 1 ? <div className="link" aria-hidden="true" style={{ marginTop: 10 }} /> : null}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </main>
  );
}
