// Fixed placements (the hotel full-day workshops): "1:1-7, 3:2-7" ↔ [{day:1, periods:[1..7]}, …]

import type { FixedSlot } from "./exportFormat";

export function parseFixedSlots(text: string): FixedSlot[] | null {
  const parts = text.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const out: FixedSlot[] = [];
  for (const part of parts) {
    const m = /^([1-7])\s*:\s*(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!m) return null;
    const day = Number(m[1]), from = Number(m[2]), to = m[3] ? Number(m[3]) : from;
    if (from < 1 || to > 12 || to < from) return null;
    out.push({ day, periods: Array.from({ length: to - from + 1 }, (_, i) => from + i) });
  }
  return out;
}

export function formatFixedSlots(slots: FixedSlot[] | null | undefined): string {
  if (!slots?.length) return "";
  return slots
    .map((s) => {
      const ps = [...s.periods].sort((a, b) => a - b);
      const contiguous = ps.every((p, i) => i === 0 || p === ps[i - 1] + 1);
      return contiguous && ps.length > 1 ? `${s.day}:${ps[0]}-${ps[ps.length - 1]}` : ps.map((p) => `${s.day}:${p}`).join(", ");
    })
    .join(", ");
}
