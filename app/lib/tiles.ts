// Original procedural pixel art: 16x16 block tiles (dirt, grass, stone,
// ores, logs, leaves, planks, deepslate) and the blocky world banner.
// Nothing here comes from Minecraft's files.

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
type Painter = (x: CanvasRenderingContext2D, r: () => number) => void;
function makeTile(paint: Painter, seed: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 16;
  paint(canvas.getContext("2d")!, rng(seed));
  return canvas;
}
const pick = <T,>(list: T[], r: () => number) => list[Math.floor(r() * list.length)];
const noise = (colors: string[]): Painter => (x, r) => {
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
    x.fillStyle = pick(colors, r);
    x.fillRect(i, j, 1, 1);
  }
};
const DIRT = ["#866043", "#79553a", "#96704f", "#6c4b32", "#8b6a4c"];
const STONE = ["#7f7f7f", "#747474", "#8a8a8a", "#6b6b6b", "#7a7a7a"];
const DEEP = ["#4d4d53", "#434349", "#57575d", "#3b3b40", "#505056"];
const topped = (baseColors: string[], top: string[], depth: number): Painter => (x, r) => {
  noise(baseColors)(x, r);
  for (let i = 0; i < 16; i++) {
    const d = depth + Math.floor(r() * 3);
    for (let j = 0; j < d; j++) {
      x.fillStyle = pick(top, r);
      x.fillRect(i, j, 1, 1);
    }
  }
};
const ore = (colors: string[]): Painter => (x, r) => {
  noise(STONE)(x, r);
  for (let n = 0; n < 5; n++) {
    const cx = 2 + Math.floor(r() * 11);
    const cy = 2 + Math.floor(r() * 11);
    x.fillStyle = pick(colors, r);
    x.fillRect(cx, cy, 2, 2);
    x.fillStyle = colors[0];
    x.fillRect(cx + 1, cy + 1, 1, 1);
  }
};

let tiles: Record<string, HTMLCanvasElement> | null = null;
export function getTiles() {
  if (tiles) return tiles;
  tiles = {
    dirt: makeTile(noise(DIRT), 3),
    grass: makeTile(topped(DIRT, ["#5d9c3a", "#6cb043", "#548c34", "#79c04c"], 3), 5),
    moss: makeTile(topped(DEEP, ["#4f7a2b", "#5f8f36", "#446b25"], 3), 6),
    stone: makeTile(noise(STONE), 7),
    coal: makeTile(ore(["#2b2b2b", "#3a3a3a"]), 9),
    copper: makeTile(ore(["#e0763c", "#b8582a", "#7fb5a0"]), 13),
    silver: makeTile(ore(["#e3e7ee", "#a9b0ba"]), 17),
    log: makeTile((x, r) => {
      for (let i = 0; i < 16; i++) {
        const c = i % 4 === 0 ? "#4f3a22" : pick(["#6b5033", "#5f472c", "#77593a"], r);
        for (let j = 0; j < 16; j++) {
          x.fillStyle = r() < 0.12 ? "#4a351f" : c;
          x.fillRect(i, j, 1, 1);
        }
      }
    }, 19),
    leaves: makeTile((x, r) => {
      for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
        if (r() < 0.14) continue;
        x.fillStyle = pick(["#3f7a28", "#4a8a2f", "#356b22", "#5a9a3a"], r);
        x.fillRect(i, j, 1, 1);
      }
    }, 23),
    tea: makeTile((x, r) => {
      for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
        if (r() < 0.1) continue;
        x.fillStyle = pick(["#8fc65a", "#7fb04c", "#a9d88f", "#6a9a3f"], r);
        x.fillRect(i, j, 1, 1);
      }
    }, 29),
    planks: makeTile((x, r) => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        x.fillStyle = j % 4 === 3 ? "#6b5230" : pick(["#a2824e", "#9c7b49", "#ae8d58", "#94743f"], r);
        x.fillRect(i, j, 1, 1);
      }
      x.fillStyle = "#6b5230";
      for (const [sx, row] of [[3, 0], [11, 1], [6, 2], [13, 3]]) x.fillRect(sx, row * 4, 1, 3);
    }, 31),
    bgdirt: makeTile(noise(["#4a3626", "#3f2e20", "#533c2a", "#38291d", "#56402c"]), 37),
    dirtdark: makeTile(noise(["#5a412c", "#503a27", "#634832", "#473322"]), 41),
    deep: makeTile((x, r) => {
      noise(["#36363b", "#303035", "#3c3c42", "#2b2b30"])(x, r);
      x.fillStyle = "#27272b";
      for (let j = 2; j < 16; j += 5) x.fillRect(0, j, 16, 1);
    }, 43),
    deepdark: makeTile(noise(["#2a2a2f", "#25252a", "#303035", "#212125"]), 47),
    btn: makeTile(noise(["#727272", "#6c6c6c", "#787878", "#686868"]), 53),
  };
  return tiles;
}

// CSS custom properties for the tiled backgrounds.
export function installTileVars() {
  const t = getTiles();
  const root = document.documentElement.style;
  const vars: [string, HTMLCanvasElement][] = [
    ["--bg-dirt", t.bgdirt], ["--bg-deep", t.deep], ["--dirt", t.dirt], ["--dirt-dark", t.dirtdark],
    ["--deep-dark", t.deepdark], ["--grass-side", t.grass], ["--moss-side", t.moss], ["--stone-tex", t.stone],
    ["--planks", t.planks], ["--btn-tex", t.btn],
  ];
  for (const [name, canvas] of vars) root.setProperty(name, `url(${canvas.toDataURL()})`);
}

export type HeroCanvases = { sky: HTMLCanvasElement; cloud: HTMLCanvasElement; far: HTMLCanvasElement; near: HTMLCanvasElement; fx: HTMLCanvasElement };
export type FireSpot = { fx: CanvasRenderingContext2D; x: number; y: number } | null;

// A blocky cross-section of the world. 1 canvas px = 2 CSS px; blocks are 16px.
export function drawHero(host: HTMLElement, canvases: HeroCanvases, night: boolean): FireSpot {
  const SC = 2;
  const W = Math.ceil(host.clientWidth / SC);
  const H = Math.ceil(host.clientHeight / SC);
  if (!W || !H) return null;
  const t = getTiles();
  const ctx: Record<string, CanvasRenderingContext2D> = {};
  for (const [name, canvas] of Object.entries(canvases)) {
    canvas.width = name === "cloud" ? W * 2 : W;
    canvas.height = H;
    canvas.style.width = `${canvas.width * SC}px`;
    canvas.style.height = `${H * SC}px`;
    ctx[name] = canvas.getContext("2d")!;
    ctx[name].imageSmoothingEnabled = false;
  }
  const r = rng(99);
  const sky = ctx.sky;
  const gradient = sky.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, night ? "#050817" : "#6e9cff");
  gradient.addColorStop(1, night ? "#18203f" : "#c3dbff");
  sky.fillStyle = gradient;
  sky.fillRect(0, 0, W, H);
  if (night) {
    for (let i = 0; i < W * 0.25; i++) {
      sky.fillStyle = r() < 0.2 ? "#ffffcc" : "#aab";
      sky.fillRect(Math.floor(r() * W), Math.floor(r() * H * 0.6), 1, 1);
    }
    const mx = Math.round(W * 0.8);
    const my = 22;
    sky.fillStyle = "#d8dcc8";
    sky.fillRect(mx, my, 16, 16);
    sky.fillStyle = "#b8bca8";
    sky.fillRect(mx + 3, my + 4, 3, 3);
    sky.fillRect(mx + 9, my + 9, 4, 3);
    sky.fillRect(mx + 10, my + 2, 2, 2);
  } else {
    const sx = Math.round(W * 0.8);
    const sy = 18;
    sky.fillStyle = "rgba(255,255,200,.35)";
    sky.fillRect(sx - 5, sy - 5, 28, 28);
    sky.fillStyle = "#fff6a0";
    sky.fillRect(sx, sy, 18, 18);
    sky.fillStyle = "#fffbd8";
    sky.fillRect(sx + 3, sy + 3, 12, 12);
  }
  const cloud = ctx.cloud;
  cloud.fillStyle = night ? "rgba(90,100,140,.35)" : "rgba(255,255,255,.9)";
  for (let rep = 0; rep < 2; rep++) {
    for (let x = 0; x < W; x += 70 + Math.floor(r() * 60)) {
      const y = 30 + Math.floor(r() * 36);
      const w = 24 + Math.floor(r() * 40);
      cloud.fillRect(rep * W + x, y, w, 6);
      cloud.fillRect(rep * W + x + 8, y - 4, Math.max(8, w - 20), 4);
    }
  }
  const far = ctx.far;
  const fb = 8;
  for (let c = 0; c * fb < W; c++) {
    const h = Math.round(H / fb - 9 + Math.sin(c * 0.23) * 2.5 + Math.sin(c * 0.07) * 3);
    for (let row = h; row * fb < H; row++) {
      far.fillStyle = row === h ? (night ? "#1f3a2a" : "#86b98a") : night ? "#172230" : "#9dbfd8";
      far.fillRect(c * fb, row * fb, fb, fb);
    }
  }
  const near = ctx.near;
  const B = 16;
  const cols = Math.ceil(W / B);
  const rows = Math.ceil(H / B);
  const surf: number[] = [];
  for (let c = 0; c < cols; c++) surf[c] = rows - 4 + Math.round(Math.sin(c * 0.45) * 0.9 + Math.sin(c * 0.17 + 1) * 1.1);
  const put = (name: string, c: number, row: number) => near.drawImage(t[name], c * B, row * B);
  for (let c = 0; c < cols; c++) {
    for (let row = surf[c]; row < rows; row++) {
      const d = row - surf[c];
      put(d === 0 ? "grass" : d < 3 ? "dirt" : r() < 0.08 ? "coal" : r() < 0.06 ? "copper" : r() < 0.03 ? "silver" : "stone", c, row);
    }
  }
  const tree = (c: number) => {
    if (c < 2 || c > cols - 3) return;
    const s = surf[c];
    for (let k = 1; k <= 4; k++) put("log", c, s - k);
    for (let dx = -2; dx <= 2; dx++) for (let dy = 3; dy <= 4; dy++) put("leaves", c + dx, s - dy - 1);
    for (let dx = -1; dx <= 1; dx++) put("leaves", c + dx, s - 6);
  };
  [Math.round(cols * 0.06), Math.round(cols * 0.52)].forEach(tree);
  const bush = Math.round(cols * 0.68);
  if (bush < cols - 1) {
    put("tea", bush, surf[bush] - 1);
    put("tea", bush + 1, surf[bush + 1] - 1);
    put("tea", bush, surf[bush] - 2);
  }
  for (let c = 0; c < cols; c++) {
    if (r() < 0.35) {
      const s = surf[c] * B;
      near.fillStyle = "#5a9a3a";
      for (let k = 0; k < 4; k++) near.fillRect(c * B + 2 + Math.floor(r() * 12), s - 3 - Math.floor(r() * 3), 1, 3);
    }
  }
  if (night) {
    near.fillStyle = "rgba(6,10,32,.5)";
    near.fillRect(0, 0, W, H);
    far.fillStyle = "rgba(6,10,32,.3)";
    far.fillRect(0, 0, W, H);
  }
  const fc = Math.round(cols * 0.82);
  return { fx: ctx.fx, x: fc * B, y: (surf[fc] - 1) * B };
}

const flames = [
  ["...y....y...", "..yoy..yoy..", "..yooyyooy..", ".yooroooroy.", ".oorrrorroo.", "..orrrrrro..", "..oorrrroo..", "...oooooo..."],
  ["....y..y....", "...yoyyoy...", "..yooooooy..", "..oorooroo..", ".yoorrrrooy.", "..orrrrrro..", "..oorrrroo..", "...oooooo..."],
];
const flameColor: Record<string, string> = { y: "#ffe066", o: "#ff9a1f", r: "#e3421b" };

export function drawFire(spot: FireSpot, frame: number, night: boolean) {
  if (!spot) return;
  const { fx, x, y } = spot;
  fx.clearRect(x - 8, y - 8, 32, 32);
  if (night) {
    fx.fillStyle = "rgba(255,160,60,.18)";
    fx.fillRect(x - 8, y - 8, 32, 24);
  }
  fx.fillStyle = "#5a3b1f";
  fx.fillRect(x + 1, y + 12, 14, 3);
  fx.fillStyle = "#3b2612";
  fx.fillRect(x + 3, y + 11, 10, 1);
  fx.fillStyle = "#7a5230";
  fx.fillRect(x, y + 14, 16, 2);
  flames[frame % 2].forEach((row, j) => [...row].forEach((c, i) => {
    if (c === ".") return;
    fx.fillStyle = flameColor[c];
    fx.fillRect(x + 2 + i, y + 3 + j, 1, 1);
  }));
}

// Small original pixel icons, drawn as SVG.
export function pixelSvg(map: string[], palette: Record<string, string>) {
  const h = map.length;
  const w = map[0].length;
  let rects = "";
  map.forEach((row, y) => [...row].forEach((c, x) => {
    if (palette[c]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${palette[c]}"/>`;
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`;
}
export const pixelUri = (map: string[], palette: Record<string, string>) => `data:image/svg+xml,${encodeURIComponent(pixelSvg(map, palette))}`;

export const ICONS: Record<string, string[]> = {
  qmark: ["..####..", ".#oooo#.", "#oo##oo#", ".##..#o#", "....#oo#", "...#oo#.", "...#o#..", "...###..", "...#o#..", "...###.."],
  tick: ["......#", ".....##", "#...##.", "##.##..", ".###...", "..#...."],
  sun: ["...y...", ".y.y.y.", "..yyy..", "yyyyyyy", "..yyy..", ".y.y.y.", "...y..."],
  moon: ["..mmm..", ".mm....", "mm.....", "mm.....", "mm.....", ".mm....", "..mmm.."],
  search: ["..###..", ".#...#.", "#.....#", "#.....#", ".#...#.", "..####.", "......#"],
  flame: ["......#.......", ".....##.......", ".....##...#...", "....###...##..", "....####..##..", "...#####.###..", "...#########..", "..##########..", "..###########.", ".############.", ".############.", ".############.", "..##########..", "...########..."],
  chest: ["########", "#bbbbbb#", "#bbbbbb#", "###yy###", "#bbyybb#", "#bbbbbb#", "#bbbbbb#", "########"],
  mob: ["..####..", ".#gggg#.", "#gkggkg#", "#gggggg#", "#gg##gg#", ".#g##g#.", "..####..", "........"],
  fish: ["........", "..###..#", ".#www#.#", "#wkwww##", "#wwwww##", ".#www#.#", "..###..#", "........"],
  pick: ["..ssss..", ".s....s.", "s..bb..s", "...bb...", "...bb...", "...bb...", "...bb...", "...bb..."],
  reward: ["...yy...", "..yyyy..", ".yyyyyy.", "yyyyyyyy", ".yyyyyy.", "..y..y..", ".y....y.", "y......y"],
  trade: ["..gggg..", ".gkggkg.", ".gggggg.", "..gbbg..", ".gbbbbg.", "gbbbbbbg", "gbbbbbbg", ".bb..bb."],
  brush: ["......bb", ".....bb.", "....bb..", "...bb...", "..yy....", ".yyy....", "yyy.....", "yy......"],
  gear: ["...ss...", ".s.ss.s.", "..ssss..", "sss..sss", "sss..sss", "..ssss..", ".s.ss.s.", "...ss..."],
  map: ["pppppppp", "p.gg..bp", "pgggg.bp", "p.gg.bbp", "p...bb.p", "p.rr.b.p", "p.rr...p", "pppppppp"],
};
export const IPAL: Record<string, string> = {
  "#": "#222", g: "#6a8a3a", w: "#cfe8b0", k: "#111", s: "#8d8d8d", r: "#b33", b: "#7a5230", t: "#0f6f73",
  c: "#c47a3a", y: "#e6c43d", o: "#d9c3f2", m: "#e0e0ff", p: "#c9b27a",
};
