import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  Advancement, Fish, Item, LootDrop, LootTable, Ore, Profession, Recipe, Structure, Trade, VersionEntry,
  VersionIndex, WikiData,
} from "./types";

export const base = import.meta.env.BASE_URL;
export const asset = (url: string | null | undefined) => (url ? `${base}${url}` : `${base}wiki/missing-texture.png`);

const storage = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // private mode: settings just don't persist
    }
  },
};
export { storage };

export type TradeRef = { trade: Trade; profession: Profession; tier: Profession["tiers"][number] };

export type Indexes = {
  item: Map<string, Item>;
  recipe: Map<string, Recipe>;
  recipesByResult: Map<string, Recipe[]>;
  recipesByIngredient: Map<string, Recipe[]>;
  loot: Map<string, LootTable>;
  dropsByItem: Map<string, { table: LootTable; drop: LootDrop }[]>;
  tableParents: Map<string, string[]>;
  structuresByTable: Map<string, Structure[]>;
  structuresByItem: Map<string, { structure: Structure; count: number }[]>;
  tradesGiving: Map<string, TradeRef[]>;
  tradesWanting: Map<string, TradeRef[]>;
  tradeRef: Map<string, TradeRef>;
  adv: Map<string, Advancement>;
  advChildren: Map<string, Advancement[]>;
  advsByItem: Map<string, Advancement[]>;
  rewardAdvsByTable: Map<string, Advancement[]>;
  ores: Map<string, Ore[]>;
  fish: Map<string, Fish>;
  repairs: Map<string, Item[]>;
  remainders: Map<string, Item[]>;
};

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildIndexes(data: WikiData): Indexes {
  const ix: Indexes = {
    item: new Map(data.items.map((item) => [item.key, item])),
    recipe: new Map(data.recipes.map((recipe) => [recipe.id, recipe])),
    recipesByResult: new Map(),
    recipesByIngredient: new Map(),
    loot: new Map(data.loot.map((table) => [table.id, table])),
    dropsByItem: new Map(),
    tableParents: new Map(),
    structuresByTable: new Map(),
    structuresByItem: new Map(),
    tradesGiving: new Map(),
    tradesWanting: new Map(),
    tradeRef: new Map(),
    adv: new Map(data.advancements.map((entry) => [entry.id, entry])),
    advChildren: new Map(),
    advsByItem: new Map(),
    rewardAdvsByTable: new Map(),
    ores: new Map(),
    fish: new Map(data.fish.map((entry) => [entry.key, entry])),
    repairs: new Map(),
    remainders: new Map(),
  };
  for (const recipe of data.recipes) {
    push(ix.recipesByResult, recipe.result.key, recipe);
    for (const key of recipe.ingredientKeys) push(ix.recipesByIngredient, key, recipe);
  }
  for (const table of data.loot) {
    for (const drop of table.drops) push(ix.dropsByItem, drop.key, { table, drop });
    for (const child of table.includes || []) push(ix.tableParents, child, table.id);
  }
  for (const structure of data.structures) {
    for (const entry of structure.lootTables) push(ix.structuresByTable, entry.table, structure);
    for (const vault of structure.vaults) push(ix.structuresByTable, vault.table, structure);
    for (const fixed of structure.fixedItems) push(ix.structuresByItem, fixed.key, { structure, count: fixed.count });
  }
  const trades = new Map(data.trades.trades.map((trade) => [trade.id, trade]));
  for (const profession of data.trades.professions) {
    for (const tier of profession.tiers) {
      for (const id of tier.trades) {
        const trade = trades.get(id);
        if (!trade) continue;
        const ref = { trade, profession, tier };
        ix.tradeRef.set(id, ref);
        if (trade.gives) push(ix.tradesGiving, trade.gives.key, ref);
        if (trade.wants) push(ix.tradesWanting, trade.wants.key, ref);
        if (trade.alsoWants) push(ix.tradesWanting, trade.alsoWants.key, ref);
      }
    }
  }
  for (const entry of data.advancements) {
    if (entry.parent) push(ix.advChildren, entry.parent, entry);
    for (const criterion of entry.criteria) for (const key of criterion.items || []) push(ix.advsByItem, key, entry);
    for (const table of entry.rewards.loot) push(ix.rewardAdvsByTable, table, entry);
  }
  for (const ore of data.worldgen.ores) for (const target of ore.targets) push(ix.ores, target.key, ore);
  for (const item of data.items) {
    for (const key of item.repairWith || []) push(ix.repairs, key, item);
    if (item.useRemainder) push(ix.remainders, item.useRemainder, item);
  }
  return ix;
}

// Advancement tabs in the order they are played: the starting tab first, then
// the rest by size, with collection-log tabs (the Angler's Almanac) last.
export function orderedTabs(data: WikiData) {
  const rank = (tab: WikiData["tabs"][number]) => (/tutorial|story/.test(tab.id) ? 0 : /almanac|with_songs/.test(tab.id) ? 2 : 1);
  return [...data.tabs].sort((a, b) => rank(a) - rank(b) || b.count - a.count);
}

type DataState = {
  index: VersionIndex | null;
  version: VersionEntry | null;
  data: WikiData | null;
  ix: Indexes | null;
  error: string | null;
  setVersion: (id: string) => void;
};

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState<VersionIndex | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [data, setData] = useState<WikiData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${base}data/versions.json`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`versions.json: ${response.status}`))))
      .then((next: VersionIndex) => {
        setIndex(next);
        const fromUrl = new URLSearchParams(location.search).get("v");
        const saved = storage.get("mf.version");
        const pick = [fromUrl, saved].find((id) => id && next.versions.some((entry) => entry.id === id));
        setVersionId(pick || next.default);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const version = index?.versions.find((entry) => entry.id === versionId) || null;
  useEffect(() => {
    if (!version) return;
    let cancelled = false;
    setData(null);
    fetch(`${base}${version.file}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`${version.file}: ${response.status}`))))
      .then((next: WikiData) => {
        if (!cancelled) setData(next);
      })
      .catch((reason: Error) => !cancelled && setError(reason.message));
    return () => {
      cancelled = true;
    };
  }, [version]);

  const ix = useMemo(() => (data ? buildIndexes(data) : null), [data]);
  const value = useMemo<DataState>(
    () => ({
      index,
      version,
      data,
      ix,
      error,
      setVersion: (id) => {
        storage.set("mf.version", id);
        setVersionId(id);
      },
    }),
    [index, version, data, ix, error],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useDataState() {
  const value = useContext(DataContext);
  if (!value) throw new Error("DataProvider missing");
  return value;
}

// For pages rendered only once data has loaded.
export function useWiki() {
  const state = useDataState();
  if (!state.data || !state.ix || !state.index || !state.version) throw new Error("Wiki data not loaded");
  return { data: state.data, ix: state.ix, index: state.index, version: state.version };
}
