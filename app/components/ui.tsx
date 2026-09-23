import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { asset, useWiki } from "../lib/data";
import { hearts, percent, roman, seconds, titleCase } from "../lib/format";
import { itemHref } from "../lib/router";
import { useSpoilers } from "../lib/spoilers";
import { ICONS, IPAL, pixelSvg } from "../lib/tiles";
import type { GlyphSheet, Item } from "../lib/types";

// ------------------------------------------------------------ glyph text

// The pack draws icons with private-use characters from its own font.
// Render those as sprites from the exported sheet; other text stays text.
function glyphIndex(sheets: GlyphSheet[]) {
  const map = new Map<string, { sheet: GlyphSheet; col: number; row: number; cols: number; rows: number }>();
  for (const sheet of sheets) {
    const rows = sheet.chars.length;
    const cols = Math.max(...sheet.chars.map((row) => [...row].length));
    sheet.chars.forEach((line, row) => [...line].forEach((char, col) => {
      if (char !== "\u0000" && char !== " " && !map.has(char)) map.set(char, { sheet, col, row, cols, rows });
    }));
  }
  return map;
}

export function GlyphText({ text, size = 18 }: { text: string; size?: number }) {
  const { data } = useWiki();
  const index = useMemo(() => glyphIndex(data.glyphs), [data.glyphs]);
  if (!/[-]/.test(text)) return <>{text}</>;
  return (
    <>
      {[...text].map((char, i) => {
        const glyph = index.get(char);
        if (!glyph) return /[-]/.test(char) ? null : <span key={i}>{char}</span>;
        const style: CSSProperties = {
          width: size,
          height: size,
          backgroundImage: `url(${asset(glyph.sheet.texture)})`,
          backgroundSize: `${glyph.cols * size}px ${glyph.rows * size}px`,
          backgroundPosition: `-${glyph.col * size}px -${glyph.row * size}px`,
        };
        return <span key={i} className="glyph" style={style} aria-hidden="true" />;
      })}
    </>
  );
}

// ------------------------------------------------------------ icons

export function PixelIcon({ name, size = 32, title }: { name: keyof typeof ICONS | string; size?: number; title?: string }) {
  const svg = pixelSvg(ICONS[name] || ICONS.chest, IPAL);
  return (
    <span
      className="picon"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function ItemIcon({ item, size = 32 }: { item: Item | undefined; size?: number }) {
  const style: CSSProperties = {
    width: size,
    height: size,
    backgroundImage: `url(${asset(item?.texture)})`,
    backgroundSize: item?.frames ? `100% ${item.frames * 100}%` : "100% 100%",
  };
  return <span className="icon" style={style} role="img" aria-label={item?.name || "Unknown item"} />;
}

// ------------------------------------------------------------ slots

type SlotProps = {
  itemKey?: string | null;
  count?: number;
  size?: "normal" | "res" | "big" | "small";
  lock?: boolean;
  tip?: string;
  tagLabel?: string;
  link?: boolean;
};

export function Slot({ itemKey, count, size = "normal", lock, tip, tagLabel, link = true }: SlotProps) {
  const { ix } = useWiki();
  const { hidden } = useSpoilers();
  const cls = `slot ${size !== "normal" ? size : ""}`;
  if (lock) return <span className={`${cls} locked`} tabIndex={0} data-tip-text="???" role="img" aria-label="Locked" />;
  if (!itemKey) return <span className={cls} tabIndex={tip ? 0 : undefined} data-tip-text={tip} />;
  const item = ix.item.get(itemKey);
  if (!item) return <span className={`${cls} unk`} tabIndex={0} data-tip-text={`${itemKey} · needs verification`}>?</span>;
  if (hidden(`item:${itemKey}`)) {
    return <span className={`${cls} locked`} tabIndex={0} data-tip-item={itemKey} data-locked="1" role="img" aria-label="Locked spoiler item" />;
  }
  const iconSize = size === "big" ? 64 : size === "small" ? 24 : 32;
  const inner = (
    <>
      <ItemIcon item={item} size={iconSize} />
      {count && count > 1 ? <span className="count">{count}</span> : null}
    </>
  );
  return link ? (
    <a className={cls} href={itemHref(itemKey)} data-tip-item={itemKey} data-tip-tag={tagLabel}>
      {inner}
    </a>
  ) : (
    <span className={cls} tabIndex={0} data-tip-item={itemKey} data-tip-tag={tagLabel}>
      {inner}
    </span>
  );
}

// A slot that cycles through every item a tag or multi-item ingredient accepts.
export function CycleSlot({ keys, label, size }: { keys: string[]; label?: string; size?: SlotProps["size"] }) {
  const [index, setIndex] = useState(0);
  const hover = useRef(false);
  useEffect(() => {
    if (keys.length < 2) return;
    const timer = setInterval(() => {
      if (!hover.current) setIndex((value) => (value + 1) % keys.length);
    }, 1000);
    return () => clearInterval(timer);
  }, [keys.length]);
  return (
    <span className="cyc" onMouseEnter={() => (hover.current = true)} onMouseLeave={() => (hover.current = false)}>
      <Slot itemKey={keys[index % keys.length]} size={size} tagLabel={keys.length > 1 ? label || `${keys.length} options` : undefined} />
    </span>
  );
}

// ------------------------------------------------------------ item link

export function ItemName({ itemKey }: { itemKey: string }) {
  const { ix } = useWiki();
  const { hidden } = useSpoilers();
  if (hidden(`item:${itemKey}`)) return <span className="lockname">???</span>;
  return <>{ix.item.get(itemKey)?.name || titleCase(itemKey)}</>;
}

export function ItemLink({ itemKey, count }: { itemKey: string; count?: number }) {
  const { ix } = useWiki();
  const { hidden } = useSpoilers();
  const item = ix.item.get(itemKey);
  const locked = hidden(`item:${itemKey}`);
  return (
    <a className="itemlink" href={itemHref(itemKey)} data-tip-item={itemKey} data-locked={locked ? "1" : undefined}>
      {locked ? <span className="slot small locked" /> : <ItemIcon item={item} size={24} />}
      <span>{locked ? "???" : item?.name || titleCase(itemKey)}</span>
      {count && count > 1 ? <span className="muted">×{count}</span> : null}
    </a>
  );
}

// ------------------------------------------------------------ spoiler lock

export function Locked({ spoilerKey, children, compact }: { spoilerKey: string; children?: ReactNode; compact?: boolean }) {
  const { hint, reveal } = useSpoilers();
  return (
    <div className={`locknote ${compact ? "compact" : ""}`}>
      {children}
      <span className="hint">{hint(spoilerKey)}</span>
      <button className="btn small" type="button" onClick={() => reveal(spoilerKey)}>
        Reveal
      </button>
    </div>
  );
}

export function SecretBadge({ spoilerKey }: { spoilerKey: string }) {
  const { isSpoiler, mode, reason } = useSpoilers();
  if (mode !== "full" || !isSpoiler(spoilerKey)) return null;
  return (
    <span className="badge secret" title={reason(spoilerKey)}>
      ◆ secret
    </span>
  );
}

// ------------------------------------------------------------ misc

export function Panel({ title, kicker, children, className = "", id }: { title?: ReactNode; kicker?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`panel notch ${className}`} id={id}>
      {kicker ? <div className="tbar">{kicker}</div> : null}
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}

export function Chance({ p }: { p: number }) {
  return (
    <span className="chance">
      <span className="bar" aria-hidden="true">
        <i style={{ width: `${Math.max(2, Math.min(100, p * 100))}%` }} />
      </span>
      <span className="pct">{percent(p)}</span>
    </span>
  );
}

export function Hearts({ hp }: { hp: number }) {
  return <span className="hearts" title={`${hp / 2} hearts`}>{hearts(hp)}</span>;
}

export function EffectLine({ effect }: { effect: { name: string; level: number; seconds: number; chance?: number; healsHp?: number } }) {
  return (
    <span className="effect">
      {effect.name} {effect.level > 1 ? roman(effect.level) : ""} ({seconds(effect.seconds)})
      {effect.chance !== undefined ? ` · ${percent(effect.chance)}` : ""}
      {effect.healsHp ? <> · heals <Hearts hp={effect.healsHp} /></> : null}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>;
}

// ------------------------------------------------------------ tooltip

export function TooltipLayer() {
  const { ix } = useWiki();
  const { hidden, hint, mode, isSpoiler } = useSpoilers();
  const [state, setState] = useState<{ x: number; y: number; el: HTMLElement } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const find = (target: EventTarget | null) => (target instanceof Element ? (target.closest("[data-tip-item],[data-tip-text]") as HTMLElement | null) : null);
    const over = (event: MouseEvent) => {
      const el = find(event.target);
      setState(el ? { x: event.clientX, y: event.clientY, el } : null);
    };
    const focus = (event: FocusEvent) => {
      const el = find(event.target);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setState({ x: rect.right, y: rect.top, el });
    };
    const hide = () => setState(null);
    document.addEventListener("mousemove", over);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("mousemove", over);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("scroll", hide, true);
    };
  }, []);

  useEffect(() => {
    const tip = tipRef.current;
    if (!tip || !state) return;
    const rect = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(state.x + 14, innerWidth - rect.width - 8)}px`;
    tip.style.top = `${Math.max(8, state.y - rect.height - 10)}px`;
  });

  if (!state) return null;
  const { el } = state;
  let body: ReactNode = null;
  const key = el.dataset.tipItem;
  if (el.dataset.tipText && !key) body = <div>{el.dataset.tipText}</div>;
  else if (key) {
    const item = ix.item.get(key);
    if (!item) body = <div>{key}</div>;
    else if (el.dataset.locked || hidden(`item:${key}`)) {
      body = (
        <>
          <div style={{ color: "#d9c3f2" }}>???</div>
          <div className="dim">{hint(`item:${key}`)}</div>
        </>
      );
    } else {
      const color = item.rarity === "epic" ? "#FF55FF" : item.rarity === "rare" ? "#55FFFF" : item.rarity === "uncommon" ? "#FFFF55" : item.color || "#FFFFFF";
      body = (
        <>
          <div style={{ color }}>{item.name}</div>
          {el.dataset.tipTag ? <div className="tag">Any: {el.dataset.tipTag}</div> : null}
          {(item.consumable?.effects || []).map((effect, i) => (
            <div key={i} className="pos">
              {effect.name} {effect.level > 1 ? roman(effect.level) : ""} ({seconds(effect.seconds)})
            </div>
          ))}
          {(item.lore || []).filter((line) => !/^❤+$/.test(line.text)).slice(0, 8).map((line, i) => (
            <div key={i} style={{ color: line.color || "#AAAAAA" }}>
              <GlyphText text={line.text} />
            </div>
          ))}
          {mode === "full" && isSpoiler(`item:${key}`) ? <div style={{ color: "#c89bff" }}>◆ secret</div> : null}
          <div className="dim small">{key}</div>
        </>
      );
    }
  }
  if (!body) return null;
  return (
    <div className="tip" ref={tipRef} role="tooltip">
      {body}
    </div>
  );
}
