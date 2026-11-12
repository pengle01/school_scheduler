// Room preferences typed or pasted as text ("121, 33, 32", "121/33/32", one per line) ↔ room ids.

// Latin letters that look like Greek capitals, so "124a" or "BIBΛ" typed on a Latin keyboard still match.
const LOOKALIKE: Record<string, string> = { A: "Α", B: "Β", E: "Ε", H: "Η", I: "Ι", K: "Κ", M: "Μ", N: "Ν", O: "Ο", P: "Ρ", T: "Τ", X: "Χ", Y: "Υ", Z: "Ζ" };
const key = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[A-Z]/g, (c) => LOOKALIKE[c] ?? c);

/** Rooms in the order written; names that match no room are returned so the form can show them. */
export function parseRoomList(text: string, rooms: { id: string; name: string }[]): { ids: string[]; unknown: string[] } {
  const byKey = new Map(rooms.map((r) => [key(r.name), r.id]));
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const part of text.split(/[\s,;/|]+/).filter(Boolean)) {
    const id = byKey.get(key(part));
    if (!id) unknown.push(part);
    else if (!ids.includes(id)) ids.push(id);
  }
  return { ids, unknown };
}

export function formatRoomList(ids: string[], rooms: { id: string; name: string }[]): string {
  const name = new Map(rooms.map((r) => [r.id, r.name]));
  return ids.map((id) => name.get(id)).filter(Boolean).join(", ");
}
