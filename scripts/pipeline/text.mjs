// English names and text components. Vanilla en_us is the base; the pack's
// language files (any namespace) override it.
import path from "node:path";
import { readJson, splitId, titleCase } from "./util.mjs";

const namedColors = {
  black: "#000000", dark_blue: "#0000AA", dark_green: "#00AA00", dark_aqua: "#00AAAA",
  dark_red: "#AA0000", dark_purple: "#AA00AA", gold: "#FFAA00", gray: "#AAAAAA",
  dark_gray: "#555555", blue: "#5555FF", green: "#55FF55", aqua: "#55FFFF",
  red: "#FF5555", light_purple: "#FF55FF", yellow: "#FFFF55", white: "#FFFFFF",
};
const sectionColors = "0123456789abcdef";

export function cssColor(color) {
  if (!color) return null;
  if (namedColors[color]) return namedColors[color];
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : null;
}

export class Text {
  constructor(resources) {
    this.lang = {};
    this.packKeys = new Set();
    for (const layer of [...resources.layers].reverse()) {
      for (const namespace of resources.namespaces("assets", layer)) {
        const entries = readJson(path.join(layer.assetsRoot, namespace, "lang", "en_us.json")) || {};
        Object.assign(this.lang, entries);
        if (layer === resources.pack) for (const key of Object.keys(entries)) this.packKeys.add(key);
      }
    }
  }

  // Whether the pack itself defines (or overrides) this translation.
  fromPack(key) {
    return this.packKeys.has(key);
  }

  has(key) {
    return typeof this.lang[key] === "string";
  }

  raw(key) {
    return this.has(key) ? this.lang[key] : "";
  }

  // Resolve "%s" / "%1$s" placeholders the way Minecraft does.
  format(template, args) {
    let next = 0;
    return template.replace(/%(?:(\d+)\$)?([sd%])/g, (match, index, kind) => {
      if (kind === "%") return "%";
      const value = index ? args[Number(index) - 1] : args[next++];
      return value ?? "";
    });
  }

  // Plain text of a component, with § codes stripped.
  plain(component) {
    return this.render(component).text;
  }

  // { text, color } where color is the first explicit colour in the tree.
  render(component, inherited = null) {
    if (component === null || component === undefined) return { text: "", color: inherited };
    if (typeof component === "string" || typeof component === "number" || typeof component === "boolean") {
      return { text: stripSection(String(component)), color: inherited || sectionColor(String(component)) };
    }
    if (Array.isArray(component)) {
      const parts = component.map((part) => this.render(part, inherited));
      return { text: parts.map((part) => part.text).join(""), color: parts.find((part) => part.color)?.color || inherited };
    }
    if (typeof component !== "object") return { text: "", color: inherited };
    const color = cssColor(component.color) || inherited;
    let text = "";
    if (component.text !== undefined) text = String(component.text);
    else if (component.translate) {
      const args = (component.with || []).map((arg) => this.render(arg).text);
      const template = this.has(component.translate)
        ? this.lang[component.translate]
        : component.fallback ?? (component.translate.includes(" ") || /[^\x20-\x7e]/.test(component.translate)
          ? component.translate
          : titleCase(component.translate.split(".").at(-1)));
      text = this.format(template, args);
    } else if (component.keybind) text = component.keybind;
    const extra = (component.extra || []).map((part) => this.render(part, color).text).join("");
    return { text: stripSection(text + extra), color: color || sectionColor(text) };
  }

  // Name for an item/block id or model id, or null if the lang has none.
  nameFor(id) {
    const [namespace, resource] = splitId(id);
    const last = resource.split("/").at(-1);
    for (const key of [
      `item.${namespace}.${resource}`,
      `block.${namespace}.${resource}`,
      `item.kleispack.${last}`,
      `item.kleispack.fish.${last}`,
      `block.kleispack.${last}`,
      `item.minecraft.${last}`,
      `block.minecraft.${last}`,
    ]) {
      if (this.has(key)) return stripSection(this.lang[key]);
    }
    return null;
  }

  effectName(id) {
    const [namespace, resource] = splitId(id);
    return stripSection(this.raw(`effect.${namespace}.${resource}`)) || titleCase(resource);
  }

  enchantmentName(id) {
    const [namespace, resource] = splitId(id);
    return stripSection(this.raw(`enchantment.${namespace}.${resource}`)) || titleCase(resource);
  }

  attributeName(id) {
    const [namespace, resource] = splitId(id);
    return (
      stripSection(this.raw(`attribute.name.${resource}`)) ||
      stripSection(this.raw(`attribute.name.${namespace}.${resource}`)) ||
      titleCase(resource)
    );
  }

  entityName(id) {
    const [namespace, resource] = splitId(id);
    return stripSection(this.raw(`entity.${namespace}.${resource}`)) || titleCase(resource);
  }

  biomeName(id) {
    const [namespace, resource] = splitId(id);
    return stripSection(this.raw(`biome.${namespace}.${resource}`)) || titleCase(resource);
  }
}

function stripSection(value) {
  return String(value).replace(/§./g, "");
}

function sectionColor(value) {
  const match = String(value).match(/§([0-9a-f])/i);
  if (!match) return null;
  const names = Object.keys(namedColors);
  return namedColors[names[sectionColors.indexOf(match[1].toLowerCase())]] || null;
}
