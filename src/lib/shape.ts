// Block shapes: how a lesson's weekly periods are cut into daily chunks.
// "2+1+1" = one double and two singles; "3+3" = two triples; "1+1+1" = singles.
// Chunks are stored largest first.

export function parseShape(text: string): number[] | null {
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
  return chunks.sort((a, b) => b - a);
}

export function formatShape(chunks: number[]): string {
  return [...chunks].sort((a, b) => b - a).join("+");
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
export function normaliseShape(text: string, periods: number): string | null {
  const unified = text.trim().replace(/[\s,;/]+/g, "+");
  const chunks = parseShape(unified);
  if (!chunks) return null;
  if (chunks.reduce((a, b) => a + b, 0) !== periods) return null;
  return formatShape(chunks);
}
