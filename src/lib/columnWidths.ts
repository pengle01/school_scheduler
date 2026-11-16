// Column widths the user sets by dragging a table's header edges, kept in localStorage as JSON.

export const MIN_COLUMN_WIDTH = 32;
export const MAX_COLUMN_WIDTH = 1200;

export function clampWidth(px: number): number {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(px)));
}

// The defaults, with every valid stored width laid over them. Unknown columns and bad values are ignored.
export function parseWidths<K extends string>(raw: string | null, defaults: Record<K, number>): Record<K, number> {
  const out = { ...defaults };
  if (!raw) return out;
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return out;
  for (const key of Object.keys(defaults) as K[]) {
    const v = (stored as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = clampWidth(v);
  }
  return out;
}
