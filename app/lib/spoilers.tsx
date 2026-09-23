import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { storage } from "./data";
import type { SpoilerEntry } from "./types";

export type Mode = "safe" | "full";

type SpoilerState = {
  ready: boolean;
  mode: Mode;
  setMode: (mode: Mode) => void;
  picked: boolean;
  setPicked: (value: boolean) => void;
  isSpoiler: (key: string) => boolean;
  hidden: (key: string) => boolean;
  hint: (key: string) => string;
  reason: (key: string) => string;
  reveal: (key: string) => void;
  revealed: Set<string>;
  forget: () => void;
};

const SpoilerContext = createContext<SpoilerState | null>(null);

function loadRevealed() {
  try {
    return new Set<string>(JSON.parse(storage.get("mf.revealed") || "[]"));
  } catch {
    return new Set<string>();
  }
}

export function SpoilerProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, SpoilerEntry> | null>(null);
  const [mode, setModeState] = useState<Mode>(() => (storage.get("mf.mode") === "full" ? "full" : "safe"));
  const [picked, setPickedState] = useState(() => storage.get("mf.picked") === "1");
  const [revealed, setRevealed] = useState(loadRevealed);

  useEffect(() => {
    import("../data/spoilers.json").then((module) => setEntries((module.default as { entries: Record<string, SpoilerEntry> }).entries));
  }, []);

  const setMode = useCallback((next: Mode) => {
    storage.set("mf.mode", next);
    setModeState(next);
  }, []);
  const setPicked = useCallback((value: boolean) => {
    storage.set("mf.picked", value ? "1" : "0");
    setPickedState(value);
  }, []);
  const reveal = useCallback((key: string) => {
    setRevealed((current) => {
      const next = new Set(current);
      next.add(key);
      storage.set("mf.revealed", JSON.stringify([...next]));
      return next;
    });
  }, []);
  const forget = useCallback(() => {
    storage.set("mf.revealed", "[]");
    setRevealed(new Set());
  }, []);

  const value = useMemo<SpoilerState>(() => {
    const isSpoiler = (key: string) => Boolean(entries?.[key]?.spoiler);
    return {
      ready: entries !== null,
      mode,
      setMode,
      picked,
      setPicked,
      isSpoiler,
      // Until the flags load, treat everything flagged as hidden in safe mode.
      hidden: (key: string) => mode === "safe" && (entries === null ? false : isSpoiler(key)) && !revealed.has(key),
      hint: (key: string) => entries?.[key]?.hint || "Revealed later in the game.",
      reason: (key: string) => entries?.[key]?.reason || "",
      reveal,
      revealed,
      forget,
    };
  }, [entries, mode, setMode, picked, setPicked, revealed, reveal, forget]);
  return <SpoilerContext.Provider value={value}>{children}</SpoilerContext.Provider>;
}

export function useSpoilers() {
  const value = useContext(SpoilerContext);
  if (!value) throw new Error("SpoilerProvider missing");
  return value;
}
