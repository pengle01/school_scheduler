// The zone grid: every zone gets fixed slots by hand, the rest of the program is built around
// them. These checks say what is wrong with a grid before the solver runs.

import type { FixedSlot } from "./exportFormat";
import { periodExists, DEFAULT_DAYS_PERIODS } from "./calendar";

export type ZoneOption = { id: string; periods: number; teacherId: string | null; pupils: string[] };
export type Zone = { id: string; name: string; fixedSlots: FixedSlot[] | null; options: ZoneOption[] };

export type ZoneIssue =
  | { kind: "unplaced"; zone: string }
  | { kind: "periods"; zone: string; slots: number; periods: number }
  | { kind: "outsideWeek"; zone: string; day: number; period: number }
  | { kind: "teacher"; teacherId: string; day: number; period: number; zones: string[] }
  | { kind: "pupil"; pupils: number; day: number; period: number; zones: string[] };

export const slotsOf = (fixed: FixedSlot[] | null | undefined): [number, number][] => (fixed ?? []).flatMap((s) => s.periods.map((p) => [s.day, p] as [number, number]));

/** Toggle one slot of a zone's grid; returns null when nothing is left. */
export function toggleSlot(fixed: FixedSlot[] | null, day: number, period: number): FixedSlot[] | null {
  const set = new Set(slotsOf(fixed).map(([d, p]) => d * 100 + p));
  const key = day * 100 + period;
  if (set.has(key)) set.delete(key);
  else set.add(key);
  const byDay = new Map<number, number[]>();
  for (const x of [...set].sort((a, b) => a - b)) byDay.set(Math.floor(x / 100), [...(byDay.get(Math.floor(x / 100)) ?? []), x % 100]);
  return byDay.size ? [...byDay.entries()].map(([d, periods]) => ({ day: d, periods })) : null;
}

/** The most common period count among a zone's options. */
export function zonePeriods(zone: Zone): number {
  const count = new Map<number, number>();
  for (const o of zone.options) count.set(o.periods, (count.get(o.periods) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

export function zoneGridIssues(zones: Zone[], daysPeriods: number[] = DEFAULT_DAYS_PERIODS): ZoneIssue[] {
  const issues: ZoneIssue[] = [];
  const bySlot = new Map<number, Zone[]>();
  for (const z of zones) {
    const slots = slotsOf(z.fixedSlots);
    if (!slots.length) {
      issues.push({ kind: "unplaced", zone: z.name });
      continue;
    }
    const periods = zonePeriods(z);
    if (slots.length !== periods) issues.push({ kind: "periods", zone: z.name, slots: slots.length, periods });
    for (const [day, period] of slots) {
      if (!periodExists(day, period, daysPeriods)) issues.push({ kind: "outsideWeek", zone: z.name, day, period });
      const key = day * 100 + period;
      bySlot.set(key, [...(bySlot.get(key) ?? []), z]);
    }
  }
  for (const [key, here] of bySlot) {
    if (here.length < 2) continue;
    const day = Math.floor(key / 100), period = key % 100;
    const teacherZones = new Map<string, Set<string>>();
    const pupilZones = new Map<string, Set<string>>();
    for (const z of here)
      for (const o of z.options) {
        if (o.teacherId) teacherZones.set(o.teacherId, (teacherZones.get(o.teacherId) ?? new Set()).add(z.name));
        for (const p of o.pupils) pupilZones.set(p, (pupilZones.get(p) ?? new Set()).add(z.name));
      }
    for (const [teacherId, zs] of teacherZones) if (zs.size > 1) issues.push({ kind: "teacher", teacherId, day, period, zones: [...zs].sort() });
    const clashing = new Map<string, number>();
    for (const zs of pupilZones.values()) if (zs.size > 1) clashing.set([...zs].sort().join("|"), (clashing.get([...zs].sort().join("|")) ?? 0) + 1);
    for (const [zs, n] of clashing) issues.push({ kind: "pupil", pupils: n, day, period, zones: zs.split("|") });
  }
  return issues;
}
