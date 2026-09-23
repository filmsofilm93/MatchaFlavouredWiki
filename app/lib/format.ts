export function titleCase(value: string) {
  return value
    .replace(/^#/, "")
    .replace(/^.*:/, "")
    .replace(/[/.]/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function percent(p: number) {
  if (p >= 0.9995) return "100%";
  if (p < 0.001) return "<0.1%";
  return `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;
}

export function seconds(value: number) {
  if (value < 0) return "∞";
  if (value >= 60) {
    const minutes = Math.floor(value / 60);
    const rest = Math.round(value % 60);
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  }
  return `${Number.isInteger(value) ? value : value.toFixed(1)} s`;
}

export function roman(level: number) {
  return ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][level] || String(level);
}

export function range(min: number, max: number) {
  return min === max ? String(min) : `${min}–${max}`;
}

export function hearts(hp: number) {
  const value = hp / 2;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ❤`;
}

export function plural(count: number, word: string, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`;
}

export const dimensionName: Record<string, string> = {
  overworld: "Overworld",
  the_nether: "Nether",
  the_end: "End",
};

export function normalize(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
