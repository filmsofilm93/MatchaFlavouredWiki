import { useEffect, useRef } from "react";
import { ModeToggle } from "../components/WikiApp";
import { Panel, PixelIcon, Slot } from "../components/ui";
import { useWiki } from "../lib/data";
import { href } from "../lib/router";
import { drawFire, drawHero, type FireSpot } from "../lib/tiles";

function Hero() {
  const { data } = useWiki();
  const host = useRef<HTMLDivElement>(null);
  const refs = {
    sky: useRef<HTMLCanvasElement>(null),
    cloud: useRef<HTMLCanvasElement>(null),
    far: useRef<HTMLCanvasElement>(null),
    near: useRef<HTMLCanvasElement>(null),
    fx: useRef<HTMLCanvasElement>(null),
  };
  useEffect(() => {
    let spot: FireSpot = null;
    let frame = 0;
    const night = () => document.documentElement.dataset.theme === "dark";
    const draw = () => {
      if (!host.current || !refs.sky.current || !refs.cloud.current || !refs.far.current || !refs.near.current || !refs.fx.current) return;
      spot = drawHero(host.current, { sky: refs.sky.current, cloud: refs.cloud.current, far: refs.far.current, near: refs.near.current, fx: refs.fx.current }, night());
      drawFire(spot, frame, night());
    };
    draw();
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = reduce ? 0 : window.setInterval(() => drawFire(spot, ++frame, night()), 240);
    const observer = new MutationObserver(draw);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    addEventListener("resize", draw);
    return () => {
      clearInterval(timer);
      observer.disconnect();
      removeEventListener("resize", draw);
    };
  }, []);
  const release = data.release;
  return (
    <div className="hero" ref={host}>
      <canvas ref={refs.sky} aria-hidden="true" />
      <canvas ref={refs.cloud} className="cloud" aria-hidden="true" />
      <canvas ref={refs.far} aria-hidden="true" />
      <canvas ref={refs.near} aria-hidden="true" />
      <canvas ref={refs.fx} aria-hidden="true" />
      <div className="title">
        <span className="pill">
          <span className="badge">v{release.version}</span> for Minecraft Java {release.minecraft}
          {release.kind === "github" ? <span className="badge warn">unreleased</span> : null}
        </span>
        <h1>Matcha Flavoured</h1>
        <span className="splash" aria-hidden="true">
          {release.name.split(": ").pop()}!
        </span>
        <div className="copy">A field guide to Klei Wright's data pack: slower, cozier survival where fire, food and metal all work differently.</div>
      </div>
    </div>
  );
}

export function HomePage() {
  const { data, index, ix } = useWiki();
  const s = data.stats;
  const p = data.mechanics.progression;
  const latest = index.changelog[0];
  return (
    <>
      <Hero />
      <main>
        <div className="grid2">
          <Panel kicker="HOW IT DIFFERS FROM VANILLA" title="Survival, rewritten">
            <ul style={{ margin: 0, paddingLeft: 22 }}>
              <li style={{ marginBottom: 9 }}>Fire starts by lighting <strong>Kindling</strong> with tinder or a flint fire starter; a hoe and a campfire open the game.</li>
              <li style={{ marginBottom: 9 }}>Grass is harvested and dried on the fire, and a <strong>Mud Kiln</strong> smelts your first copper.</li>
              <li style={{ marginBottom: 9 }}>Metals carry <strong>intrinsics</strong>; alloys like Bronze, Shakudo and Steel change how gear behaves.</li>
              <li style={{ marginBottom: 9 }}>Meals heal with Regeneration instead of filling a hunger bar.</li>
              {p ? (
                <li style={{ marginBottom: 9 }}>
                  Dying costs hearts: {p.heartsLostPerDeath.normal ?? "?"} per death on Normal{p.heartsLostPerDeath.hard ? `, ${p.heartsLostPerDeath.hard} on Hard` : ""}, up to {p.maximumHearts} hearts in total.{" "}
                  <a href={href("mechanics")}>How the death system works</a>
                </li>
              ) : null}
              <li>
                A full catalogue: <strong>{s.packRecipes}</strong> pack recipes, <strong>{s.customItems}</strong> custom items, <strong>{s.advancements}</strong> advancements, <strong>{s.lootTables}</strong> loot tables.
              </li>
            </ul>
          </Panel>
          <Panel kicker="SPOILER MODE" title="How much do you want to know?">
            <p>
              <strong>Spoiler-free keeps the pack's surprises; Full shows everything.</strong> Klei designed Matcha Flavoured around discovery, so Spoiler-free is the default.
            </p>
            <ModeToggle small={false} />
            <p className="muted" style={{ margin: "12px 0 0" }}>
              You can change this any time from the header. Revealed entries are remembered on this device.
            </p>
          </Panel>
        </div>
        <Panel kicker="INSTALL CHECKLIST" title="Getting it running">
          <ol className="checklist">
            <li><input type="checkbox" id="c1" /><label htmlFor="c1">Download the pack from <a href="https://modrinth.com/datapack/matcha-flavoured">Modrinth</a>. This wiki never hosts it.</label></li>
            <li><input type="checkbox" id="c2" /><label htmlFor="c2">Since 1.12.2 the pack comes as two files: put the <strong>data pack</strong> (DP) zip in your world's <code>datapacks</code> folder and the <strong>resource pack</strong> (RP) zip in <code>resourcepacks</code>, then enable it.</label></li>
            <li><input type="checkbox" id="c3" /><label htmlFor="c3">Load the world and confirm the chat message saying Matcha Flavoured is loaded.</label></li>
            <li><input type="checkbox" id="c4" /><label htmlFor="c4">Using the Modrinth launcher? Check that the data pack is added to the world, not only the resource pack.</label></li>
            <li><input type="checkbox" id="c5" /><label htmlFor="c5">Seeing <code>item.kleispack.…</code> names? Your data pack and resource pack are on <strong>different versions</strong>. Use matching files.</label></li>
          </ol>
        </Panel>
        {latest ? (
          <Panel kicker={`LATEST RELEASE · ${latest.published}`} title={`${latest.version}: ${latest.name}`}>
            <ul style={{ margin: 0, paddingLeft: 22 }}>
              {latest.blocks.filter((block) => block.type === "bullet").slice(0, 6).map((block, i) => (
                <li key={i}>{block.text}</li>
              ))}
            </ul>
            <p style={{ margin: "12px 0 0" }}>
              <a href={href("changelog")}>Full changelog</a>
            </p>
          </Panel>
        ) : null}
        <h2 className="onbg" style={{ marginTop: 27 }}>
          Explore
        </h2>
        <div className="cards">
          {[
            ["Main route", "From campfire to the End", "minecraft:campfire", href("route")],
            ["Recipes", "Every station, exact slots", "minecraft:crafting_table", href("recipes")],
            ["Advancement map", "Every tab, zoomable", "minecraft:grass_block", href("advancements")],
            ["Where to find it", "Structures, ores, mobs, fishing, trades", "minecraft:compass", href("places")],
            ["Food & healing", "Hearts healed, effects, eat time", "minecraft:bread", href("food")],
            ["Gear", "Tools, alloys, intrinsics", "minecraft:iron_pickaxe", href("gear")],
            ["Mechanics", "Death system, rules, scripts", "minecraft:clock", href("mechanics")],
            ["My progress", "Tick off advancements", "minecraft:writable_book", href("progress")],
          ].map(([title, text, icon, link]) => (
            <a key={title} className="card panel notch" href={link}>
              <div className="row">
                {ix.item.has(icon) ? <Slot itemKey={icon} link={false} /> : <span className="slot"><PixelIcon name="chest" /></span>}
                <div>
                  <div style={{ color: "var(--ink-2)" }}>{title}</div>
                  <div className="muted">{text}</div>
                </div>
              </div>
            </a>
          ))}
        </div>
      </main>
    </>
  );
}
