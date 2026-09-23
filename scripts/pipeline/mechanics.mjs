// Mechanics read from the pack's functions. Everything reported is a fact
// taken from a command (gamerules, effects applied, attributes, scoreboards,
// in-game messages); nothing is paraphrased.
import { normalizeId, readText, splitId, titleCase } from "./util.mjs";

// Lenient SNBT -> JSON for text components (unquoted keys, single quotes).
export function parseComponent(source) {
  const trimmed = source.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  let out = "";
  let i = 0;
  while (i < trimmed.length) {
    const ch = trimmed[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let value = "";
      while (j < trimmed.length && trimmed[j] !== ch) {
        if (trimmed[j] === "\\") { value += trimmed[j + 1]; j += 2; continue; }
        value += trimmed[j];
        j += 1;
      }
      out += JSON.stringify(value);
      i = j + 1;
    } else if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < trimmed.length && /[A-Za-z0-9_.+-]/.test(trimmed[j])) j += 1;
      const word = trimmed.slice(i, j);
      out += /^(true|false|null)$/.test(word) ? word : JSON.stringify(word);
      i = j;
    } else if (/[0-9-]/.test(ch)) {
      let j = i;
      while (j < trimmed.length && /[0-9.eE+-]/.test(trimmed[j])) j += 1;
      out += trimmed.slice(i, j);
      i = /[bBsSlLfFdD]/.test(trimmed[j] || "") ? j + 1 : j;
    } else {
      out += ch;
      i += 1;
    }
  }
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

const groupFor = (resource) => {
  const parts = resource.split("/");
  if (["mechanics", "mechanic", "timers", "enchantment_effects", "setup"].includes(parts[0]) && parts.length > 2) return `${parts[0]}/${parts[1]}`;
  return parts.length > 1 ? parts[0] : "root";
};

export function buildMechanics({ resources, text }) {
  const functions = [];
  for (const [id, hit] of resources.list("function", { ext: ".mcfunction" })) {
    if (hit.layer !== "pack") continue;
    functions.push({ id, lines: readText(hit.file).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")) });
  }
  const entry = new Set([...resources.tag("function", "minecraft:load"), ...resources.tag("function", "minecraft:tick")]);
  const tickSet = new Set(resources.tag("function", "minecraft:tick"));
  const calledBy = new Map();
  const groups = new Map();
  const gamerules = [];

  for (const fn of functions) {
    const [namespace, resource] = splitId(fn.id);
    const groupId = `${namespace}:${groupFor(resource)}`;
    const group = groups.get(groupId) || { id: groupId, name: titleCase(groupFor(resource).split("/").at(-1)), files: 0, effects: new Map(), messages: new Set(), attributes: new Set(), scoreboards: new Set(), loot: new Set(), gamerules: [], functions: [] };
    group.files += 1;
    group.functions.push(fn.id);
    for (const line of fn.lines) {
      const command = line.replace(/^(execute .*? run )+/, "");
      const conditional = command !== line;
      let match;
      for (const called of line.matchAll(/\bfunction (#?[a-z0-9_.-]+:[a-z0-9_/.-]+)/g)) {
        const target = normalizeId(called[1].replace(/^#/, ""));
        calledBy.set(target, [...(calledBy.get(target) || []), fn.id]);
      }
      if ((match = /^gamerule (\S+) (\S+)/.exec(command))) {
        group.gamerules.push({ rule: match[1], value: match[2] });
        gamerules.push({ rule: match[1], value: match[2], function: fn.id });
      } else if ((match = /^effect give (\S+) (\S+)(?: (\d+|infinite))?(?: (\d+))?/.exec(command))) {
        const effect = normalizeId(match[2]);
        const key = `${effect}|${match[4] || 0}`;
        const current = group.effects.get(key) || { effect, name: text.effectName(effect), level: Number(match[4] || 0) + 1, seconds: new Set(), conditional: false };
        current.seconds.add(match[3] === "infinite" ? -1 : Number(match[3] || 30));
        current.conditional ||= conditional;
        group.effects.set(key, current);
      } else if ((match = /^(tellraw|title) \S+ (?:(?:title|subtitle|actionbar) )?(.+)$/.exec(command))) {
        const component = parseComponent(match[2]);
        const rendered = component ? text.plain(component) : "";
        if (rendered.trim()) group.messages.add(rendered.trim());
      } else if ((match = /^attribute (\S+) (\S+) (base set|modifier add) (.+)$/.exec(command))) {
        group.attributes.add(`${text.attributeName(match[2])}: ${match[3] === "base set" ? "set to" : "modifier"} ${match[4].split(" ").filter((part) => !part.includes(":")).join(" ")}`);
      } else if ((match = /^scoreboard objectives add (\S+) (\S+)/.exec(command))) {
        group.scoreboards.add(`${match[1]} (${match[2]})`);
      } else if ((match = /\bloot (?:give|spawn|insert|replace) .* loot (\S+)/.exec(command))) {
        group.loot.add(normalizeId(match[1]));
      }
    }
    groups.set(groupId, group);
  }

  // The pack's settings: `scoreboard players set <fake player> <objective> N`
  // (e.g. "$Max Hearts 60"). Scores for health are in half-hearts.
  const constants = [];
  for (const fn of functions) {
    for (const line of fn.lines) {
      const match = /^scoreboard players set ([^@\s]\S*) (\S+) (-?\d+)$/.exec(line);
      if (match && !constants.some((entry) => entry.holder === match[1] && entry.objective === match[2])) {
        constants.push({ holder: match[1], objective: match[2], value: Number(match[3]), function: fn.id });
      }
    }
  }
  const difficultyNames = { 1: "easy", 2: "normal", 3: "hard" };
  const difficultiesFor = (condition) => {
    if (!condition) return ["easy", "normal", "hard"];
    const [low, high] = condition.includes("..")
      ? condition.split("..").map((value, index) => (value === "" ? (index ? 3 : 0) : Number(value)))
      : [Number(condition), Number(condition)];
    return Object.entries(difficultyNames).filter(([level]) => level >= low && level <= high).map(([, name]) => name);
  };
  // Hearts lost per death, per difficulty, from whichever function removes them.
  const deathLoss = {};
  const sources = {};
  let heartGain = null;
  for (const fn of functions) {
    for (const line of fn.lines) {
      const removed = /players remove @s Hearts (\d+)/.exec(line);
      if (removed && !/minimum/.test(fn.id)) {
        const condition = /difficulty_score matches (\S+)/.exec(line)?.[1];
        for (const name of difficultiesFor(condition)) deathLoss[name] ??= Number(removed[1]) / 2;
        sources.deathLoss = fn.id;
      }
      const added = /players add @s Hearts (\d+)/.exec(line);
      if (added && heartGain === null) {
        heartGain = Number(added[1]) / 2;
        sources.heartGain = fn.id;
      }
    }
  }
  const constant = (holder, objective) => constants.find((entry) => entry.holder === holder && entry.objective === objective);
  const halves = (entry) => (entry ? entry.value / 2 : null);
  const minimum = {
    easy: halves(constant("$Easy", "minimum_hearts")),
    normal: halves(constant("$Normal", "minimum_hearts")),
    hard: halves(constant("$Hard", "minimum_hearts")),
  };
  const progression = Object.keys(deathLoss).length || constant("$Max", "Hearts")
    ? {
        maximumHearts: halves(constant("$Max", "Hearts") || constant("maximum_hearts", "Hearts")),
        heartsLostPerDeath: deathLoss,
        crystalHeartGain: heartGain,
        ...(Object.values(minimum).some((value) => value !== null) ? { minimumHearts: minimum } : {}),
        startingMinimumHearts: halves(constant("current_minimum_hearts", "Hearts")),
        sources,
      }
    : null;

  const mechanicGroups = [...groups.values()].map((group) => {
    const entryPoints = group.functions.filter((id) => entry.has(id));
    return {
      id: group.id,
      name: group.name,
      files: group.files,
      runsEveryTick: group.functions.some((id) => tickSet.has(id)),
      ...(entryPoints.length ? { entryPoints } : {}),
      calledFrom: [...new Set(group.functions.flatMap((id) => calledBy.get(id) || []).filter((caller) => !group.functions.includes(caller)))].slice(0, 12),
      effects: [...group.effects.values()].map((effect) => ({ ...effect, seconds: [...effect.seconds].sort((a, b) => a - b) })),
      messages: [...group.messages].slice(0, 20),
      attributes: [...group.attributes],
      scoreboards: [...group.scoreboards],
      loot: [...group.loot],
      gamerules: group.gamerules,
      // Item-migration helpers hand out items but are not ways to obtain them.
      migration: /update_old_items|remove_vanilla_items/.test(group.id),
    };
  }).sort((a, b) => a.id.localeCompare(b.id));

  return { groups: mechanicGroups, gamerules, progression, constants, functionCount: functions.length };
}
