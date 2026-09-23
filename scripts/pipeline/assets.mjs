// Item textures and font glyphs. Only textures an item, block or glyph
// actually uses are exported, content-addressed under <out>/tex/, so vanilla
// GUI art and font files never reach the site.
import fs from "node:fs";
import path from "node:path";
import { normalizeId, sha1, splitId } from "./util.mjs";

export function pngSize(buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(12) !== 0x49484452) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export class Assets {
  constructor(resources, outDir, urlPrefix = "tex/") {
    this.resources = resources;
    this.outDir = outDir;
    this.urlPrefix = urlPrefix;
    this.exported = new Map(); // texture id -> record
    this.itemTextures = new Map();
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Copy one texture (e.g. "minecraft:item/stick") to the output.
  texture(textureId) {
    const id = normalizeId(textureId);
    if (this.exported.has(id)) return this.exported.get(id);
    const hit = this.resources.file("textures", id, { kind: "assets", ext: ".png" });
    let record = null;
    if (hit) {
      const bytes = fs.readFileSync(hit.file);
      const size = pngSize(bytes) || { width: 16, height: 16 };
      const name = `${sha1(bytes).slice(0, 16)}.png`;
      const target = path.join(this.outDir, name);
      if (!fs.existsSync(target)) fs.writeFileSync(target, bytes);
      const animated = fs.existsSync(`${hit.file}.mcmeta`) && size.height > size.width;
      record = {
        url: this.urlPrefix + name,
        w: size.width,
        h: animated ? size.width : size.height,
        ...(animated ? { frames: Math.floor(size.height / size.width) } : {}),
        origin: hit.layer,
      };
    }
    this.exported.set(id, record);
    return record;
  }

  model(modelId) {
    return this.resources.json("models", modelId, { kind: "assets" });
  }

  // Walk a model and its parents for the texture that best represents it.
  modelTexture(modelId, seen = new Set()) {
    const id = normalizeId(modelId);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    const model = this.model(id);
    if (!model) return null;
    const textures = model.textures && typeof model.textures === "object" ? model.textures : {};
    const ordered = [
      textures.layer0, textures.all, textures.front, textures.side, textures.top,
      textures.texture, textures.cross, textures.particle, ...Object.values(textures),
    ].filter((value) => typeof value === "string" && !value.startsWith("#"));
    for (const texture of ordered) {
      const record = this.texture(texture);
      if (record) return record;
    }
    return typeof model.parent === "string" ? this.modelTexture(model.parent, seen) : null;
  }

  // First plain model referenced by an item model definition
  // (assets/<ns>/items/<path>.json). Prefers the "default"/fallback branch.
  static firstModel(node) {
    if (!node || typeof node !== "object") return null;
    if (node.type?.endsWith("model") && typeof node.model === "string") return node.model;
    for (const key of ["fallback", "on_false", "model", "cases", "entries", "models"]) {
      if (node[key] === undefined) continue;
      const found = Assets.firstModel(node[key]);
      if (found) return found;
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") {
        const found = Assets.firstModel(value);
        if (found) return found;
      }
    }
    return null;
  }

  // Texture for an item key (an item_model id or a plain item id).
  itemTexture(key) {
    const id = normalizeId(key);
    if (this.itemTextures.has(id)) return this.itemTextures.get(id);
    const [namespace, resource] = splitId(id);
    let record = null;
    const definition = this.resources.json("items", id, { kind: "assets" });
    const model = Assets.firstModel(definition);
    if (model) record = this.modelTexture(model);
    if (!record) record = this.modelTexture(`${namespace}:item/${resource}`);
    if (!record) {
      // Blocks without an item form (candle cakes, bamboo shoots...).
      const states = this.resources.json("blockstates", id, { kind: "assets" });
      const variant = states?.variants ? Object.values(states.variants)[0] : states?.multipart?.[0]?.apply;
      const stateModel = [].concat(variant || [])[0]?.model;
      if (stateModel) record = this.modelTexture(stateModel);
    }
    if (!record) record = this.texture(`${namespace}:item/${resource}`) || this.texture(`${namespace}:block/${resource}`);
    if (!record && resource.endsWith("_banner")) record = this.texture("minecraft:entity/banner/base");
    this.itemTextures.set(id, record);
    return record;
  }

  // Bitmap glyphs from the pack's fonts (private-use icons in lore and
  // advancement text). Returns [{ texture, chars: [rows], ascent, height }].
  glyphs() {
    const sheets = [];
    const seen = new Set();
    const visitFont = (fontId) => {
      if (seen.has(fontId)) return;
      seen.add(fontId);
      const font = this.resources.json("font", fontId, { kind: "assets" });
      for (const provider of font?.providers || []) {
        const type = String(provider.type || "").replace(/^minecraft:/, "");
        if (type === "reference") visitFont(normalizeId(provider.id));
        if (type !== "bitmap") continue;
        const chars = (provider.chars || []).map(String);
        // Only private-use characters: normal letters come from our own font.
        if (!chars.join("").match(/[-]/)) continue;
        const texture = this.texture(normalizeId(provider.file).replace(/\.png$/, ""));
        if (!texture) continue;
        sheets.push({
          texture: texture.url,
          sheetW: texture.w,
          sheetH: texture.frames ? texture.h * texture.frames : texture.h,
          chars,
          ascent: provider.ascent ?? 7,
          height: provider.height ?? 8,
        });
      }
    };
    visitFont("minecraft:default");
    return sheets;
  }
}
