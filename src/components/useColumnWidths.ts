"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { clampWidth, parseWidths } from "@/lib/columnWidths";

// Column widths kept in localStorage under `columns:<key>`. useSyncExternalStore reads the
// stored text (a stable primitive), so there is no setState-in-effect and no hydration mismatch.
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

function readRaw(name: string): string | null {
  try {
    return window.localStorage.getItem(name);
  } catch {
    return null;
  }
}

export function useColumnWidths<K extends string>(key: string | undefined, defaults: Record<K, number>) {
  const name = `columns:${key ?? ""}`;
  const raw = useSyncExternalStore(
    subscribe,
    () => (key ? readRaw(name) : null),
    () => null,
  );
  const widths = useMemo(() => parseWidths(raw, defaults), [raw, defaults]);

  // px = null puts the column back to its default
  const setWidth = useCallback(
    (column: K, px: number | null) => {
      if (!key) return;
      const next: Record<string, number> = { ...parseWidths(readRaw(name), defaults) };
      next[column] = px === null ? defaults[column] : clampWidth(px);
      try {
        window.localStorage.setItem(name, JSON.stringify(next));
      } catch {
        // private window: nothing to keep
      }
      listeners.forEach((fn) => fn());
    },
    [key, name, defaults],
  );

  return { widths, setWidth };
}
