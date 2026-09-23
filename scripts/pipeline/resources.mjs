// A layered view over the pack and vanilla Minecraft, the way the game sees
// them: a pack file overrides the vanilla file with the same ID, and tags are
// merged unless the pack sets "replace". Nothing here assumes a namespace.
import fs from "node:fs";
import path from "node:path";
import { normalizeId, readJson, splitId, toPosix, walk } from "./util.mjs";

// pack.mcmeta "filter": { block: [{ namespace, path }] } hides matching files
// of every pack below it. Both fields are regexes tested with find()
// semantics (Pattern.asPredicate); a missing field matches everything.
export function compileFilter(meta) {
  return (meta?.filter?.block || []).map((entry) => ({
    namespace: entry.namespace ? new RegExp(entry.namespace) : null,
    path: entry.path ? new RegExp(entry.path) : null,
  }));
}

export class Resources {
  // layers: [{ name, dataRoot, assetsRoot, filter? }], highest priority first.
  constructor(layers) {
    this.layers = layers.filter(Boolean);
    this.listCache = new Map();
    this.jsonCache = new Map();
    this.tagCache = new Map();
  }

  // Whether a file in `layer` is hidden by a higher layer's filter.
  // resourcePath is relative to the namespace, e.g. "recipe/mace.json".
  blocked(layer, namespace, resourcePath) {
    for (const higher of this.layers) {
      if (higher === layer) return false;
      for (const rule of higher.filter || []) {
        if ((!rule.namespace || rule.namespace.test(namespace)) && (!rule.path || rule.path.test(resourcePath))) return true;
      }
    }
    return false;
  }

  get pack() {
    return this.layers[0];
  }

  namespaces(kind = "data", layer = null) {
    const roots = (layer ? [layer] : this.layers).map((entry) =>
      kind === "data" ? entry.dataRoot : entry.assetsRoot,
    );
    return [...new Set(roots.flatMap((root) =>
      fs.existsSync(root)
        ? fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
        : [],
    ))];
  }

  // Map of id -> { file, layer } for every resource of `type` (e.g. "recipe",
  // "worldgen/placed_feature", "tags/item") across all namespaces and layers.
  list(type, { kind = "data", ext = ".json", layer = null, unfiltered = false } = {}) {
    const cacheKey = `${kind}|${type}|${ext}|${layer?.name || "*"}|${unfiltered}`;
    if (this.listCache.has(cacheKey)) return this.listCache.get(cacheKey);
    const result = new Map();
    const layers = layer ? [layer] : this.layers;
    for (const entry of [...layers].reverse()) {
      const root = kind === "data" ? entry.dataRoot : entry.assetsRoot;
      for (const namespace of this.namespaces(kind, entry)) {
        const base = path.join(root, namespace, ...type.split("/"));
        for (const file of walk(base)) {
          if (!file.endsWith(ext)) continue;
          const relative = toPosix(path.relative(base, file)).slice(0, -ext.length);
          if (!unfiltered && this.blocked(entry, namespace, `${type}/${relative}${ext}`)) continue;
          result.set(`${namespace}:${relative}`, { file, layer: entry.name });
        }
      }
    }
    this.listCache.set(cacheKey, result);
    return result;
  }

  file(type, id, { kind = "data", ext = ".json" } = {}) {
    const [namespace, resource] = splitId(id);
    for (const entry of this.layers) {
      const root = kind === "data" ? entry.dataRoot : entry.assetsRoot;
      const file = path.join(root, namespace, ...type.split("/"), `${resource}${ext}`);
      if (fs.existsSync(file) && !this.blocked(entry, namespace, `${type}/${resource}${ext}`)) {
        return { file, layer: entry.name };
      }
    }
    return null;
  }

  json(type, id, options) {
    const key = `${options?.kind || "data"}|${type}|${normalizeId(id)}`;
    if (this.jsonCache.has(key)) return this.jsonCache.get(key);
    const hit = this.file(type, normalizeId(id), options);
    const value = hit ? readJson(hit.file) : null;
    this.jsonCache.set(key, value);
    return value;
  }

  // Which layer defines this resource ("pack" or "vanilla"), or null.
  origin(type, id, options) {
    return this.file(type, normalizeId(id), options)?.layer || null;
  }

  // Expand a tag (without "#") into its member IDs. registry is e.g. "item",
  // "block", "villager_trade", "worldgen/biome".
  tag(registry, id, seen = new Set()) {
    const tagId = normalizeId(id);
    const cacheKey = `${registry}|${tagId}`;
    if (this.tagCache.has(cacheKey)) return this.tagCache.get(cacheKey);
    if (seen.has(cacheKey)) return [];
    seen.add(cacheKey);
    const [namespace, tagPath] = splitId(tagId);
    const values = [];
    for (const entry of this.layers) {
      for (const folder of [`tags/${registry}`, `tags/${registry}s`]) {
        const file = path.join(entry.dataRoot, namespace, ...folder.split("/"), `${tagPath}.json`);
        const blocked = this.blocked(entry, namespace, `${folder}/${tagPath}.json`);
        const tag = !blocked && fs.existsSync(file) ? readJson(file) : null;
        if (!tag) continue;
        values.push(...(tag.values || []));
        if (tag.replace) return this.finishTag(registry, cacheKey, values, namespace, seen);
      }
    }
    return this.finishTag(registry, cacheKey, values, namespace, seen);
  }

  finishTag(registry, cacheKey, values, namespace, seen) {
    const expanded = [];
    for (const raw of values) {
      const value = typeof raw === "string" ? raw : raw?.id || "";
      if (!value) continue;
      if (value.startsWith("#")) expanded.push(...this.tag(registry, value.slice(1), seen));
      else expanded.push(normalizeId(value, namespace));
    }
    const unique = [...new Set(expanded)];
    this.tagCache.set(cacheKey, unique);
    return unique;
  }

  // Tag reference or single id or list -> member IDs.
  members(registry, value) {
    if (Array.isArray(value)) return value.flatMap((entry) => this.members(registry, entry));
    if (typeof value !== "string" || !value) return [];
    return value.startsWith("#") ? this.tag(registry, value.slice(1)) : [normalizeId(value)];
  }
}
