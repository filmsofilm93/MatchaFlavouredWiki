import { useMemo, useState } from "react";
import { RecipeGui } from "../components/RecipeGui";
import { Empty, ItemLink, ItemName, Panel } from "../components/ui";
import { useWiki } from "../lib/data";
import { normalize, titleCase } from "../lib/format";
import { advHref, href, withQuery } from "../lib/router";
import { useSpoilers } from "../lib/spoilers";

const PAGE = 48;

export function RecipesPage({ query }: { query: URLSearchParams }) {
  const { data, ix } = useWiki();
  const { hidden } = useSpoilers();
  const station = query.get("station") || "all";
  const origin = query.get("origin") || "pack";
  const [family, setFamily] = useState("all");
  const [text, setText] = useState(query.get("q") || "");
  const [limit, setLimit] = useState(PAGE);
  const inStation = data.recipes.filter((recipe) => (station === "all" || recipe.station === station) && (origin === "all" || (origin === "pack" ? recipe.origin !== "vanilla" : recipe.origin === "vanilla")));
  const families = useMemo(() => [...new Set(inStation.map((recipe) => recipe.family))].sort(), [inStation]);
  const words = normalize(text);
  const list = inStation.filter((recipe) => {
    if (family !== "all" && recipe.family !== family) return false;
    if (!words) return true;
    if (hidden(`recipe:${recipe.id}`) || hidden(`item:${recipe.result.key}`)) return false;
    const name = ix.item.get(recipe.result.key)?.name || recipe.id;
    return normalize(`${name} ${recipe.id}`).includes(words);
  });
  const link = (next: Record<string, string>) => withQuery(href("recipes"), { station, origin, ...next });
  return (
    <main className="wide">
      <div className="pagehead">
        <span className="kicker">RECIPES</span>
        <h1>Recipes</h1>
        <p>Each recipe is drawn as its station's screen with every ingredient in its slot. Tags cycle through everything they accept; hover a slot for its tooltip.</p>
      </div>
      <div className="filters">
        <a className="btn small" href={link({ station: "all" })} aria-current={station === "all" ? "page" : undefined}>
          All stations
        </a>
        {data.stations.map((entry) => (
          <a key={entry.id} className="btn small" href={link({ station: entry.id })} aria-current={station === entry.id ? "page" : undefined}>
            {entry.label} ({entry.count})
          </a>
        ))}
      </div>
      <div className="filters">
        {[["pack", "Added or changed by the pack"], ["vanilla", "Unchanged Minecraft"], ["all", "Both"]].map(([id, label]) => (
          <a key={id} className="btn small" href={link({ origin: id })} aria-current={origin === id ? "page" : undefined}>
            {label}
          </a>
        ))}
        <select value={family} onChange={(event) => setFamily(event.target.value)} aria-label="Family">
          <option value="all">All families</option>
          {families.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        <input type="search" placeholder="Find a recipe…" value={text} onChange={(event) => setText(event.target.value)} aria-label="Find a recipe" />
        <span className="onbg">{list.length} recipes</span>
      </div>
      <Panel>
        {list.length ? null : <Empty>No recipes match.</Empty>}
        <div className="recipes">
          {list.slice(0, limit).map((recipe) => (
            <div key={recipe.id} className="recipecard">
              <RecipeGui recipe={recipe} />
              <span className="caption muted">
                <ItemName itemKey={recipe.result.key} />
              </span>
            </div>
          ))}
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

export function RecipePage({ slug }: { slug: string }) {
  const { data, ix } = useWiki();
  const { hidden } = useSpoilers();
  const recipe = data.recipes.find((entry) => entry.slug === slug);
  if (!recipe) {
    return (
      <main>
        <h1>Unknown recipe</h1>
        <p className="onbg">
          <a href={href("recipes")}>All recipes</a>
        </p>
      </main>
    );
  }
  const unlockers = recipe.unlockedBy.map((id) => ({ id, adv: ix.adv.get(id) }));
  const shown = data.advancements.filter((adv) => adv.unlocks.includes(recipe.id));
  const ingredients = recipe.ingredientKeys;
  return (
    <main>
      <p className="onbg">
        <a href={href("recipes")} style={{ color: "#55ffff" }}>
          ← Recipes
        </a>
      </p>
      <Panel kicker={`${recipe.stationLabel.toUpperCase()} · ${recipe.origin === "vanilla" ? "UNCHANGED MINECRAFT RECIPE" : recipe.origin === "changed" ? "CHANGED BY THE PACK" : "ADDED BY THE PACK"}`} title={<ItemName itemKey={recipe.result.key} />}>
        <RecipeGui recipe={recipe} showLink={false} />
        <dl className="facts" style={{ marginTop: 18 }}>
          <dt>Makes</dt>
          <dd>
            <ItemLink itemKey={recipe.result.key} count={recipe.result.count} />
          </dd>
          <dt>Ingredients</dt>
          <dd className="taglist">
            {ingredients.slice(0, 24).map((key) => (
              <ItemLink key={key} itemKey={key} />
            ))}
            {ingredients.length > 24 ? <span className="muted">and {ingredients.length - 24} more options</span> : null}
          </dd>
          <dt>Family</dt>
          <dd>{recipe.family}</dd>
          <dt>Recipe book</dt>
          <dd>
            {unlockers.length ? (
              <>
                Unlocked by {unlockers.map(({ id, adv }) => (adv ? (hidden(`advancement:${adv.id}`) ? "a hidden advancement" : <a key={id} href={advHref(adv.id, adv.tab)}>“{adv.title}”</a>) : <code key={id}>{id}</code>))}
                {shown.length ? <> (completed alongside {shown.map((adv) => (hidden(`advancement:${adv.id}`) ? "???" : `“${adv.title}”`)).join(", ")})</> : null}
              </>
            ) : (
              "Never added to the recipe book automatically; it can still be crafted."
            )}
          </dd>
          <dt>ID</dt>
          <dd>
            <code>{recipe.id}</code>
            {recipe.group ? <span className="muted"> · group {titleCase(recipe.group)}</span> : null}
          </dd>
        </dl>
      </Panel>
    </main>
  );
}
