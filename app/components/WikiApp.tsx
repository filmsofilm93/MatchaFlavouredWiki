import { useEffect, useState } from "react";
import { asset, DataProvider, storage, useDataState, useWiki } from "../lib/data";
import { href, useRoute } from "../lib/router";
import { SpoilerProvider, useSpoilers, type Mode } from "../lib/spoilers";
import { ICONS, installTileVars, pixelUri } from "../lib/tiles";
import { AdvancementsPage } from "../pages/Advancements";
import { ChangelogPage } from "../pages/Changelog";
import { FoodPage } from "../pages/Food";
import { GearPage } from "../pages/Gear";
import { HomePage } from "../pages/Home";
import { ItemPage } from "../pages/Item";
import { ItemsPage } from "../pages/Items";
import { LootPage } from "../pages/Loot";
import { MechanicsPage } from "../pages/Mechanics";
import { PlacesPage } from "../pages/Places";
import { ProgressPage } from "../pages/Progress";
import { RecipePage, RecipesPage } from "../pages/Recipes";
import { RoutePage } from "../pages/Route";
import { SearchOverlay } from "../pages/Search";
import { PixelIcon, TooltipLayer } from "./ui";

type Theme = "light" | "dark";

const nav: [string, string][] = [
  ["home", "Home"],
  ["route", "Progression"],
  ["recipes", "Recipes"],
  ["items", "Items"],
  ["places", "Where to find"],
  ["food", "Food"],
  ["gear", "Gear"],
  ["mechanics", "Mechanics"],
  ["advancements", "Advancements"],
  ["progress", "My progress"],
];

function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = storage.get("mf.theme");
    if (saved === "light" || saved === "dark") return saved;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return [
    theme,
    (next) => {
      storage.set("mf.theme", next);
      setTheme(next);
    },
  ];
}

export function ModeToggle({ small = true }: { small?: boolean }) {
  const { mode, setMode } = useSpoilers();
  const button = (value: Mode, label: string) => (
    <button type="button" className={`btn ${small ? "small" : ""}`} aria-pressed={mode === value} onClick={() => setMode(value)}>
      {label}
    </button>
  );
  return (
    <div className="toggle" role="group" aria-label="Spoiler mode">
      {button("safe", "Spoiler-free")}
      {button("full", "Full")}
    </div>
  );
}

function Picker() {
  const { picked, setPicked, setMode } = useSpoilers();
  const { version } = useDataState();
  const [choice, setChoice] = useState<Mode>("safe");
  if (picked) return null;
  const icon = asset(version?.icon);
  return (
    <div className="picker" role="dialog" aria-modal="true" aria-labelledby="picker-title">
      <div className="box">
        <h2 id="picker-title">Select a way to read</h2>
        <div role="radiogroup" aria-label="Spoiler mode">
          <button type="button" className="world" role="radio" aria-checked={choice === "safe"} onClick={() => setChoice("safe")}>
            <img src={icon} alt="" />
            <span>
              <span>Spoiler-free</span>
              <small>Keeps the pack's surprises. Secrets show as locked slots with a hint and a Reveal button.</small>
              <small>Recommended for a first playthrough</small>
            </span>
          </button>
          <button type="button" className="world" role="radio" aria-checked={choice === "full"} onClick={() => setChoice("full")}>
            <img src={icon} alt="" style={{ filter: "hue-rotate(250deg)" }} />
            <span>
              <span>Full</span>
              <small>Shows everything: every recipe, secret ingredient, hidden advancement and drop chance.</small>
              <small>Secret entries keep a small badge</small>
            </span>
          </button>
        </div>
        <p className="note">Klei built Matcha Flavoured around discovery. You can switch any time from the header.</p>
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setMode(choice);
              setPicked(true);
            }}
          >
            Enter the wiki
          </button>
        </div>
      </div>
    </div>
  );
}

function VersionSelect() {
  const { index, version, setVersion } = useDataState();
  if (!index || index.versions.length < 2) return null;
  return (
    <select className="version" aria-label="Pack version" value={version?.id} onChange={(event) => setVersion(event.target.value)}>
      {index.versions.map((entry) => (
        <option key={entry.id} value={entry.id}>
          {entry.kind === "release" ? `v${entry.version} (latest release)` : entry.label}
        </option>
      ))}
    </select>
  );
}

function Header({ onSearch, theme, setTheme, current }: { onSearch: () => void; theme: Theme; setTheme: (theme: Theme) => void; current: string }) {
  const { version } = useDataState();
  return (
    <header className="site">
      <div className="hwrap">
        <div className="hrow">
          <a className="logo" href={href()}>
            <img src={version?.icon ? asset(version.icon) : `${import.meta.env.BASE_URL}wiki/pack.png`} alt="Matcha Flavoured pack icon" />
            Matcha Wiki
          </a>
          <span className="spacer" />
          <button type="button" className="searchbox" onClick={onSearch} aria-label="Search (press /)">
            <PixelIcon name="search" size={18} />
            Search…
          </button>
          <VersionSelect />
          <ModeToggle />
          <button type="button" className="btn small" aria-label={`Switch to ${theme === "dark" ? "day" : "night"} theme`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            <PixelIcon name={theme === "dark" ? "moon" : "sun"} size={18} />
          </button>
        </div>
        <nav className="main" aria-label="Main">
          {nav.map(([id, label]) => (
            <a key={id} className="btn small" href={id === "home" ? href() : href(id)} aria-current={current === id ? "page" : undefined}>
              {label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

function VersionBanner() {
  const { index, version, setVersion } = useDataState();
  if (!index || !version || version.kind === "release") return null;
  return (
    <div className="versionbar">
      You are viewing {version.label}: unreleased changes from the official repository.{" "}
      <button type="button" onClick={() => setVersion(index.default)}>
        Back to the latest release
      </button>
    </div>
  );
}

function Pages() {
  const route = useRoute();
  const [section, ...rest] = route.parts;
  switch (section || "home") {
    case "home":
      return <HomePage />;
    case "items":
      return <ItemsPage query={route.query} />;
    case "item":
      return <ItemPage itemKey={rest.join("/")} />;
    case "recipes":
      return <RecipesPage query={route.query} />;
    case "recipe":
      return <RecipePage slug={rest[0]} />;
    case "advancements":
      return <AdvancementsPage query={route.query} />;
    case "route":
      return <RoutePage />;
    case "places":
      return <PlacesPage sub={rest[0]} query={route.query} />;
    case "loot":
      return <LootPage id={rest.join("/")} />;
    case "food":
      return <FoodPage />;
    case "gear":
      return <GearPage />;
    case "mechanics":
      return <MechanicsPage />;
    case "progress":
      return <ProgressPage />;
    case "changelog":
      return <ChangelogPage />;
    default:
      return (
        <main>
          <h1>Not found</h1>
          <p className="onbg">
            That page does not exist. <a href={href()}>Go home</a>.
          </p>
        </main>
      );
  }
}

function Loaded({ searching, closeSearch }: { searching: boolean; closeSearch: () => void }) {
  useWiki();
  return (
    <>
      <Pages />
      <TooltipLayer />
      {searching ? <SearchOverlay onClose={closeSearch} /> : null}
      <Picker />
    </>
  );
}

function Footer() {
  const { version, index } = useDataState();
  return (
    <footer className="site">
      <p>
        Data from {version ? `Matcha Flavoured ${version.version} (${version.kind === "github" ? `GitHub ${version.commit?.slice(0, 7)}` : "Modrinth"})` : "Matcha Flavoured"} for Minecraft {version?.minecraft}, rebuilt
        automatically{index ? ` (last check ${new Date(index.updatedAt).toISOString().slice(0, 10)})` : ""}. Pack content by Klei Wright and contributors under CC BY-NC-SA 4.0. Minecraft item and block
        textures © Mojang, shown for identification. Font: Monocraft (SIL OFL). All interface art is original. <a href={href("changelog")}>Changelog</a>.
      </p>
    </footer>
  );
}

function Shell() {
  const { data, error } = useDataState();
  const route = useRoute();
  const [theme, setTheme] = useTheme();
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !/input|textarea|select/i.test(target.tagName)) {
        event.preventDefault();
        setSearching(true);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const first = route.parts[0];
  const current = first === "item" ? "items" : first === "recipe" ? "recipes" : first === "loot" ? "places" : first || "home";
  return (
    <>
      <a className="sr" href="#content">
        Skip to content
      </a>
      <div className="fanbar">
        Unofficial fan project. Not affiliated with or endorsed by Klei Wright. Get the pack on <a href="https://modrinth.com/datapack/matcha-flavoured">Modrinth</a> · source on{" "}
        <a href="https://github.com/kleiwright/matcha-flavoured">GitHub</a>.
      </div>
      <VersionBanner />
      <Header onSearch={() => setSearching(true)} theme={theme} setTheme={setTheme} current={current} />
      <div id="content">
        {error ? (
          <main>
            <h1>Could not load the wiki</h1>
            <p className="onbg">{error}</p>
          </main>
        ) : !data ? (
          <main>
            <p className="onbg">Loading the pack…</p>
          </main>
        ) : (
          <Loaded searching={searching} closeSearch={() => setSearching(false)} />
        )}
      </div>
      <Footer />
    </>
  );
}

export function WikiApp() {
  useEffect(() => {
    installTileVars();
    const root = document.documentElement.style;
    root.setProperty("--q", `url("${pixelUri(ICONS.qmark, { "#": "#000", o: "#d9c3f2" })}")`);
    root.setProperty("--tick", `url("${pixelUri(ICONS.tick, { "#": "#fff" })}")`);
  }, []);
  return (
    <DataProvider>
      <SpoilerProvider>
        <Shell />
      </SpoilerProvider>
    </DataProvider>
  );
}
