import type { ReactNode } from "react";
import { useWiki } from "../lib/data";
import { seconds } from "../lib/format";
import { recipeHref } from "../lib/router";
import { useSpoilers } from "../lib/spoilers";
import { ICONS, pixelSvg } from "../lib/tiles";
import type { Ingredient, Recipe } from "../lib/types";
import { CycleSlot, Locked, SecretBadge, Slot } from "./ui";

const ARROW = "M0 5h14V0h2v1h1v1h1v1h1v1h1v1h1v1h1v3h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-2V10H0z";

function Arrow({ sec }: { sec?: number }) {
  return (
    <span className="arrow" aria-hidden="true">
      <svg viewBox="0 0 22 15" shapeRendering="crispEdges">
        <path d={ARROW} fill="#8b8b8b" />
      </svg>
      {sec ? (
        <svg className="fill" viewBox="0 0 22 15" shapeRendering="crispEdges" style={{ ["--t" as string]: `${sec}s` }}>
          <path d={ARROW} fill="#fff" />
        </svg>
      ) : null}
    </span>
  );
}

const flameLit = ICONS.flame.map((row, y) => row.replace(/#/g, y < 6 ? "y" : y < 10 ? "o" : "r"));
const flameOff = pixelSvg(ICONS.flame, { "#": "#8b8b8b" });
const flameOn = pixelSvg(flameLit, { y: "#ffe066", o: "#ff9a1f", r: "#e3421b" });

function Flame() {
  return (
    <span className="flame" title="Fuel burning">
      <span dangerouslySetInnerHTML={{ __html: flameOff }} />
      <span className="lit" dangerouslySetInnerHTML={{ __html: flameOn }} />
    </span>
  );
}

function tagLabel(ingredient: Ingredient) {
  return ingredient.tag ? `#${ingredient.tag}` : undefined;
}

function IngredientSlot({ ingredient, locked, tip }: { ingredient: Ingredient | null | undefined; locked: boolean; tip?: string }) {
  if (locked) return <Slot lock />;
  if (!ingredient) return <Slot tip={tip} />;
  if (ingredient.unresolved) return <Slot itemKey={`#${ingredient.tag}`} />;
  if (ingredient.keys.length === 1) return <Slot itemKey={ingredient.keys[0]} />;
  return <CycleSlot keys={ingredient.keys} label={tagLabel(ingredient)} />;
}

// One recipe drawn as its station's screen, every slot in place.
export function RecipeGui({ recipe, showLink = true }: { recipe: Recipe; showLink?: boolean }) {
  const { ix } = useWiki();
  const { hidden, revealed } = useSpoilers();
  const spoilerKey = `recipe:${recipe.id}`;
  // Revealing the recipe or the item it makes unlocks the whole screen.
  const locked = hidden(spoilerKey) && !revealed.has(`item:${recipe.result.key}`);
  const s = (ingredient: Ingredient | null | undefined, tip?: string) => <IngredientSlot ingredient={ingredient} locked={locked} tip={tip} />;
  const result = locked ? <Slot lock size="res" /> : <Slot itemKey={recipe.result.key} count={recipe.result.count} size="res" />;
  const campfire = ix.item.get("minecraft:campfire");
  let title = recipe.stationLabel;
  let body: ReactNode = null;
  const meta: ReactNode[] = [];
  if (recipe.kind === "shaped" || recipe.kind === "shapeless") {
    title = "Crafting";
    body = (
      <>
        <div className="g3">{(recipe.grid || []).map((cell, i) => <span key={i} className="g3cell">{s(cell)}</span>)}</div>
        <Arrow />
        {result}
      </>
    );
    if (recipe.kind === "shapeless") meta.push(<span className="chip" title="Any arrangement in the grid works">Shapeless</span>);
  } else if (recipe.kind === "cooking") {
    body = (
      <>
        <div className="fcol">
          {s(recipe.input)}
          <Flame />
          <Slot tip="Fuel: anything that burns" />
        </div>
        <Arrow sec={recipe.seconds} />
        {result}
      </>
    );
    meta.push(seconds(recipe.seconds || 0), `${recipe.xp || 0} XP`);
  } else if (recipe.kind === "campfire") {
    title = campfire?.name || "Campfire";
    body = (
      <>
        <div className="fcol camp">
          {s(recipe.input)}
          <Slot itemKey="minecraft:campfire" link={false} />
        </div>
        <Arrow sec={recipe.seconds} />
        {result}
      </>
    );
    meta.push(seconds(recipe.seconds || 0), "placed on the fire");
  } else if (recipe.kind === "smithing") {
    const slots = recipe.slots || [];
    body = (
      <>
        <div className="srow">
          {s(slots[0], "Template: none needed")}
          {s(slots[1])}
          {s(slots[2])}
        </div>
        <Arrow />
        {result}
      </>
    );
    if (!slots[0]) meta.push(<span className="chip">No template</span>);
  } else if (recipe.kind === "stonecutting") {
    body = (
      <>
        {s(recipe.input)}
        <div className="sclist" aria-label="Recipe list, this option selected">
          {locked ? <Slot lock size="small" /> : <Slot itemKey={recipe.result.key} size="small" />}
          <span className="off" />
          <span className="off" />
          <span className="off" />
        </div>
        <Arrow />
        {result}
      </>
    );
  }
  if (recipe.origin === "vanilla") meta.push(<span className="chip vanilla" title="Unchanged Minecraft recipe">Vanilla</span>);
  if (locked) meta.length = 0;
  return (
    <div className="rwrap">
      <figure className="gui notch" aria-label={locked ? "Locked recipe" : `${title} recipe`}>
        <figcaption className="gt">
          {showLink && !locked ? <a href={recipeHref(recipe.slug)}>{title}</a> : title}
          <SecretBadge spoilerKey={spoilerKey} />
        </figcaption>
        <div className="gb">{body}</div>
        {meta.length ? (
          <div className="gmeta">
            {meta.map((entry, i) => (
              <span key={i}>{entry}</span>
            ))}
          </div>
        ) : null}
      </figure>
      {locked ? <Locked spoilerKey={spoilerKey} compact /> : null}
    </div>
  );
}
