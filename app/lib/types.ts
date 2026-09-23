// Shapes of public/data/*.json (written by scripts/pipeline/build.mjs).

export type TextLine = { text: string; color?: string };

export type Effect = {
  id: string;
  name: string;
  level: number;
  seconds: number;
  chance?: number;
  healsHp?: number;
};

export type Item = {
  key: string;
  name: string;
  baseId: string;
  baseIds: string[];
  namespace: string;
  custom: boolean;
  renamed: boolean;
  texture: string | null;
  frames?: number;
  unverified?: boolean;
  color?: string;
  rarity?: string;
  lore?: TextLine[];
  food?: { nutrition: number; saturation: number; alwaysEdible?: boolean };
  consumable?: { seconds: number; animation: string; effects: Effect[]; other: string[]; healsHp?: number };
  useRemainder?: string;
  cooldown?: number;
  durability?: number;
  stack?: number;
  unbreakable?: boolean;
  tool?: { defaultSpeed: number; damagePerBlock: number; rules: { blocks: string; speed?: number; drops?: boolean }[] };
  weapon?: { damagePerAttack: number; disableBlocking: number };
  attributes?: { attribute: string; name: string; amount: number; operation: string; slot: string }[];
  enchantments?: { id: string; name: string; level: number }[];
  storedEnchantments?: { id: string; name: string; level: number }[];
  slot?: string;
  repairWith?: string[];
  glider?: boolean;
  deathProtection?: boolean;
  fireResistant?: boolean;
  jukeboxSong?: string;
  flags?: string[];
  alsoNamed?: string[];
  variants: number;
};

export type Ingredient = { keys: string[]; tag?: string; unresolved?: boolean };

export type Recipe = {
  id: string;
  slug: string;
  kind: "shaped" | "shapeless" | "cooking" | "campfire" | "smithing" | "stonecutting";
  station: string;
  stationLabel: string;
  origin: "added" | "changed" | "vanilla";
  folder: string;
  category: string;
  family: string;
  result: { key: string; baseId: string; count: number };
  ingredientKeys: string[];
  grid?: (Ingredient | null)[];
  slots?: (Ingredient | null)[];
  input?: Ingredient | null;
  seconds?: number;
  xp?: number;
  group?: string;
  unlockedBy: string[];
};

export type Criterion = {
  name: string;
  trigger: string;
  items?: string[];
  entities?: string[];
  structures?: string[];
  biomes?: string[];
  effects?: string[];
  blocks?: string[];
  recipe?: string;
  dimension?: { from: string | null; to: string | null };
};

export type Advancement = {
  id: string;
  title: string;
  description: string;
  frame: "task" | "goal" | "challenge";
  hidden: boolean;
  iconKey: string | null;
  tab: string;
  parent: string | null;
  criteria: Criterion[];
  requirements: string[][];
  rewards: { recipes: string[]; loot: string[]; experience: number; function: string | null };
  unlocks: string[];
};

export type Tab = { id: string; title: string; iconKey: string | null; count: number };

export type LootDrop = {
  key: string;
  chance: number;
  min: number;
  max: number;
  conditions?: string[];
  notes?: string[];
};

export type LootEntry = {
  type: string;
  key?: string;
  table?: string;
  tag?: string;
  keys?: string[];
  children?: string[];
  weight: number;
  perRoll: number;
  count?: [number, number];
  conditions?: string[];
  conditionChance?: number;
  notes?: string[];
};

export type LootTable = {
  id: string;
  label: string;
  category: string;
  type: string;
  origin: "pack" | "vanilla" | null;
  pools: { rolls: number[]; conditions?: string[]; chance?: number; entries: LootEntry[] }[];
  drops: LootDrop[];
  includes?: string[];
};

export type Stack = { key: string; min: number; max: number; stars?: number };

export type Trade = {
  id: string;
  wants: Stack | null;
  alsoWants?: Stack | null;
  gives: Stack | null;
  maxUses: number;
  xp: number;
  discount?: number;
  notes?: string[];
  conditional?: boolean;
  origin: string | null;
};

export type Profession = {
  id: string;
  name: string;
  tiers: { id: string; level: number | null; name: string; amount: number; duplicates?: boolean; trades: string[] }[];
};

export type Fish = { key: string; tier: string; stars: number; sells: number; level: number | null; trade: string };

export type Ore = {
  id: string;
  configured: string | null;
  type: string;
  targets: { key: string; block: string; replaces: string }[];
  size: number;
  airExposureDiscard: number;
  perChunk: { min: number; max: number };
  rarity?: number;
  height: { shape: string; min: number | null; max: number | null; plateau?: number } | null;
  dimension: string;
  biomeCount: number;
  biomes: string[];
  byPack: boolean;
};

export type Biome = { id: string; name: string; dimension: string; origin: string | null };

export type Structure = {
  id: string;
  name: string;
  type: string;
  origin: string | null;
  byPack: boolean;
  biomes: string[];
  biomeTag: string | null;
  placement: { set: string; spacing: number | null; separation: number | null; placement: string; frequency: number | null } | null;
  templates: number;
  lootTables: { table: string; containers: number | null; fromCode?: boolean; templates: string[] }[];
  fixedItems: { key: string; count: number }[];
  spawners: { entity: string; name: string; count: number }[];
  entities: { entity: string; name: string; count: number }[];
  vaults: { table: string; key: string | null; ominous: boolean; count: number }[];
};

export type Enchantment = {
  id: string;
  name: string;
  color?: string;
  maxLevel: number;
  slots: string[];
  supported: string | null;
  supportedCount: number;
  exclusiveSet?: string;
  weight: number;
  anvilCost: number;
  effects: string[];
  functions?: string[];
  intrinsic: boolean;
  changesVanilla: boolean;
  inEnchantingTable: boolean;
};

export type MechanicGroup = {
  id: string;
  name: string;
  files: number;
  runsEveryTick: boolean;
  entryPoints?: string[];
  calledFrom: string[];
  effects: { effect: string; name: string; level: number; seconds: number[]; conditional: boolean }[];
  messages: string[];
  attributes: string[];
  scoreboards: string[];
  loot: string[];
  gamerules: { rule: string; value: string }[];
  migration: boolean;
};

export type Progression = {
  maximumHearts: number | null;
  heartsLostPerDeath: Record<string, number>;
  crystalHeartGain: number | null;
  minimumHearts?: Record<string, number | null>;
  startingMinimumHearts: number | null;
  sources: Record<string, string>;
};

export type GlyphSheet = { texture: string; sheetW: number; sheetH: number; chars: string[]; ascent: number; height: number };

export type Release = {
  kind: "release" | "github";
  version: string;
  name: string;
  channel: string;
  minecraft: string;
  published: string;
  icon: string | null;
  modrinthUrl?: string;
  downloadUrl?: string;
  commit?: string;
  repositoryUrl?: string;
  repositoryChangelog?: ChangelogBlock[];
};

export type ChangelogBlock = { type: "heading" | "bullet" | "paragraph"; text: string };

export type WikiData = {
  schema: number;
  release: Release;
  stats: Record<string, number> & { stationCounts: Record<string, number> };
  stations: { id: string; label: string; count: number }[];
  items: Item[];
  recipes: Recipe[];
  advancements: Advancement[];
  tabs: Tab[];
  recipeUnlocks: { id: string; parent: string | null; criteria: Criterion[]; rewards: Advancement["rewards"] }[];
  loot: LootTable[];
  trades: { professions: Profession[]; trades: Trade[] };
  fish: Fish[];
  worldgen: { bounds: Record<string, { minY: number; maxY: number }>; biomes: Biome[]; ores: Ore[]; changedFeatures: unknown[]; packBiomes: string[] };
  structures: Structure[];
  enchantments: Enchantment[];
  mechanics: {
    groups: MechanicGroup[];
    gamerules: { rule: string; value: string; function: string }[];
    progression: Progression | null;
    constants: { holder: string; objective: string; value: number; function: string }[];
    functionCount: number;
  };
  glyphs: GlyphSheet[];
};

export type VersionEntry = {
  id: string;
  kind: "release" | "github";
  file: string;
  version: string;
  label: string;
  name: string;
  minecraft: string;
  published: string;
  commit?: string;
  icon: string | null;
};

export type VersionIndex = {
  schema: number;
  default: string;
  versions: VersionEntry[];
  changelog: { version: string; name: string; published: string; minecraft: string[]; channel: string; featured: boolean; blocks: ChangelogBlock[] }[];
  updatedAt: string;
};

export type SpoilerEntry = { spoiler: boolean; reason: string; hint: string; manual?: boolean };
