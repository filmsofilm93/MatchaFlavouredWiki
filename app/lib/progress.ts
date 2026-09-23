import { useCallback, useEffect, useState } from "react";
import { storage } from "./data";

// Advancements the reader has ticked off, kept on this device only.
const KEY = "mf.done";
const listeners = new Set<() => void>();

function read() {
  try {
    return new Set<string>(JSON.parse(storage.get(KEY) || "[]"));
  } catch {
    return new Set<string>();
  }
}

export function useProgress() {
  const [done, setDone] = useState(read);
  useEffect(() => {
    const refresh = () => setDone(read());
    listeners.add(refresh);
    return () => {
      listeners.delete(refresh);
    };
  }, []);
  const write = useCallback((next: Set<string>) => {
    storage.set(KEY, JSON.stringify([...next]));
    listeners.forEach((listener) => listener());
  }, []);
  const toggle = useCallback((id: string) => {
    const next = read();
    if (next.has(id)) next.delete(id);
    else next.add(id);
    write(next);
  }, [write]);
  const replace = useCallback((ids: string[]) => write(new Set(ids)), [write]);
  return { done, toggle, replace };
}
