// Block shapes: how a lesson's weekly periods are cut into daily chunks.
// "2+1+1" = one double and two singles; "3+3" = two triples; "1+1+1" = singles.
// Chunks are stored largest first — except for a cross-day lesson, where the order is the split:
// "3+4" = the last 3 periods of a day, then periods 1–4 of the next day; further chunks as usual.

export function parseShape(text: string, keepOrder = false): number[] | null {
  const parts = text
    .replace(/\s+/g, "")
    .split("+")
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  const chunks: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const n = Number(p);
    if (n < 1 || n > 8) return null;
    chunks.push(n);
  }
  return keepOrder ? chunks : chunks.sort((a, b) => b - a);
}

export function formatShape(chunks: number[], keepOrder = false): string {
  return (keepOrder ? [...chunks] : [...chunks].sort((a, b) => b - a)).join("+");
}

/** The split of a cross-day lesson: periods at the end of a day, then at the start of the next. */
export function crossDaySplit(shape: string, periods: number): [number, number] {
  const chunks = parseShape(shape, true);
  if (chunks && chunks.length >= 2 && chunks.reduce((a, b) => a + b, 0) === periods) return [chunks[0], chunks[1]];
  const n = Math.max(2, Math.min(periods, chunks?.[0] ?? 2));
  return [Math.ceil(n / 2), Math.floor(n / 2)];
}

export function shapeMatchesPeriods(text: string, periods: number): boolean {
  const chunks = parseShape(text);
  if (!chunks) return false;
  return chunks.reduce((a, b) => a + b, 0) === periods;
}

// Default: all singles.
export function defaultShape(periods: number): string {
  if (periods < 1) return "";
  return Array.from({ length: periods }, () => 1).join("+");
}

// Normalise user input: "2 1 1" → "2+1+1", "2,1,1" → "2+1+1"; returns null if invalid.
// keepOrder: a cross-day lesson, whose first two chunks are the split and must not be reordered.
export function normaliseShape(text: string, periods: number, keepOrder = false): string | null {
  const unified = text.trim().replace(/[\s,;/]+/g, "+");
  const chunks = parseShape(unified, keepOrder);
  if (!chunks) return null;
  if (chunks.reduce((a, b) => a + b, 0) !== periods) return null;
  return formatShape(chunks, keepOrder);
}
