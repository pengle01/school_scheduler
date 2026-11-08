// Orologio project (.DAT + .REL + optional .RES) → the app's export JSON.
// Field positions are documented in OROLOGIO-FORMAT.md.

import type { ExportFile, ExportV1File, FixedSlot } from "@/lib/exportFormat";
import { upgradeV1, type InferReport } from "@/lib/structure";
import {
  parseRecords,
  parseRes,
  patternToShape,
  subjectLevel,
  groupKind,
  groupYear,
  groupDirection,
  canonicalGroupName,
  departmentOf,
  type ResRow,
} from "./parse";

export interface OrologioFiles {
  dat: string;
  rel: string;
  res?: string;
}

export interface ConvertReport {
  teachers: number;
  subjects: number;
  groups: number;
  mergedDuplicateGroups: number;
  students: number;
  memberships: number;
  pools: number;
  lessons: number;
  lessonsWithPool: number;
  unavailability: number;
  structure: InferReport;
}

const REAL_CLASS_FLAG = "0";

export function convertOrologio(files: OrologioFiles, schoolName = ""): { file: ExportFile; report: ConvertReport } {
  // Orologio is read into the v1 shape (groups + pools), then the structures are inferred.
  const D = parseRecords(files.dat);
  const R = parseRecords(files.rel);
  const res: ResRow[] = files.res ? parseRes(files.res) : [];
  const get = (t: number) => D.get(t) ?? [];

  // ── teachers (type 2) + unavailability (type 5, 1-based teacher index; 0 = whole school)
  const teacherRows = get(2);
  const teacherName = (i1: number) => teacherRows[i1 - 1]?.[0]?.trim() ?? `?${i1}`;
  const unav = new Map<number, { day: number; period: number; kind: "HARD" }[]>();
  for (const [body] of get(5)) {
    const [t, d, p] = body.trim().split(/\s+/).map(Number);
    if (t === 0) continue;
    if (!unav.has(t)) unav.set(t, []);
    unav.get(t)!.push({ day: d, period: p, kind: "HARD" });
  }
  const teachers: ExportV1File["teachers"] = teacherRows.map((f, i) => ({
    name: f[0].trim(),
    firstName: f[1]?.trim() || null,
    department: departmentOf(f[0].trim(), f[3] ?? ""),
    obligation: Number(f[4]) || 0,
    reduction: 0,
    active: f[60] !== "0",
    note: f[53]?.trim() || null,
    unavailability: unav.get(i + 1) ?? [],
  }));

  // ── subjects (13015)
  const subjectRows = get(13015);
  const subjectOf = (i1: number) => {
    const f = subjectRows[i1 - 1];
    const name = (f?.[0] ?? `?${i1}`).trim();
    return { name, level: subjectLevel(name), code: f?.[6] && f[6] !== "0" ? f[6] : null };
  };
  const subjectKeySet = new Map<string, ExportV1File["subjects"][number]>();
  for (let i = 1; i <= subjectRows.length; i++) {
    const s = subjectOf(i);
    subjectKeySet.set(`${s.name}|${s.level}`, { name: s.name, level: s.level, code: s.code, periodsPerWeek: Number(subjectRows[i - 1][11]) || null, note: null });
  }

  // ── groups (type 6): id → canonical name; duplicates and "-" variants collapse to one group
  const groupRows = get(6);
  const groupById = new Map<number, { name: string; isHome: boolean; count: number }>();
  for (const f of groupRows) {
    const id = Number(f[0]);
    const rawName = f[1].trim();
    const name = canonicalGroupName(rawName);
    const isHome = f[5] !== "" && !rawName.includes("_") && !rawName.includes("+") && !rawName.endsWith("-");
    groupById.set(id, { name, isHome, count: Number(f[4]) || 0 });
  }
  const groupNames = new Map<string, { isHome: boolean }>();
  let mergedDuplicateGroups = 0;
  for (const g of groupById.values()) {
    if (groupNames.has(g.name)) {
      mergedDuplicateGroups++;
      if (g.isHome) groupNames.get(g.name)!.isHome = true;
    } else groupNames.set(g.name, { isHome: g.isHome });
  }

  // Home groups in file order, cut into the real classes by their sub-slot counts (type 3 f2):
  // this is how RES rows with cls ≤ 7 name a home group (cls, slot) → group.
  const classRows = get(3);
  const homeIds = [...groupById.entries()].filter(([, g]) => g.isHome).map(([id]) => id);
  const realClasses = classRows.map((f, i) => ({ row: i + 1, real: f[0] === REAL_CLASS_FLAG, count: Number(f[2]) || 0, name: f[83]?.trim() ?? "" }));
  const homeByClassSlot = new Map<string, number>(); // "cls-slot" → group id
  const classSlotOfHome = new Map<number, string>();
  let k = 0;
  for (const c of realClasses.filter((c) => c.real)) {
    for (let j = 1; j <= c.count && k < homeIds.length; j++, k++) {
      homeByClassSlot.set(`${c.row}-${j}`, homeIds[k]);
      classSlotOfHome.set(homeIds[k], `${c.row}-${j}`);
    }
  }
  // Pool (virtual class) members as "cls-slot" keys
  const poolMembers = new Map<number, Set<string>>();
  for (const c of realClasses.filter((c) => !c.real)) {
    const f = classRows[c.row - 1];
    const set = new Set<string>();
    for (let j = 0; j < 8; j++) if (f[3 + j] && f[3 + j] !== "0") set.add(`${f[3 + j]}-${f[43 + j]}`);
    poolMembers.set(c.row, set);
  }
  // type 41: composite group → its home-group members as "cls-slot"
  const members41 = new Map<number, Set<string>>();
  for (const f of get(41)) {
    const set = new Set<string>();
    for (let j = 0; j < 8; j++) if (f[1 + j] && f[1 + j] !== "0") set.add(`${f[1 + j]}-${f[41 + j]}`);
    if (set.size) members41.set(Number(f[0]), set);
  }
  const parentsOf = (id: number): string[] => {
    const set = members41.get(id);
    if (!set) return [];
    return [...set].map((key) => homeByClassSlot.get(key)).filter((x): x is number => x !== undefined).map((hid) => groupById.get(hid)!.name);
  };

  const groups: ExportV1File["groups"] = [];
  const seenGroup = new Set<string>();
  for (const [id, g] of groupById) {
    if (seenGroup.has(g.name)) continue;
    seenGroup.add(g.name);
    const isHome = groupNames.get(g.name)!.isHome;
    const kind = groupKind(g.name, isHome);
    groups.push({
      name: g.name,
      kind,
      year: groupYear(g.name),
      direction: groupDirection(g.name),
      parents: isHome ? [] : [...new Set(parentsOf(id))].filter((p) => p !== g.name),
      note: null,
    });
  }

  // ── students (17010) + membership (17011)
  const memberships = new Map<number, Set<string>>();
  let membershipCount = 0;
  for (const [body] of get(17011)) {
    const [s, code] = body.trim().split(/\s+/).map(Number);
    const g = groupById.get(Math.floor(code / 10));
    if (!g) continue;
    if (!memberships.has(s)) memberships.set(s, new Set());
    memberships.get(s)!.add(g.name);
    membershipCount++;
  }
  const homeSet = new Set([...groupNames.entries()].filter(([, v]) => v.isHome).map(([n]) => n));
  const students: ExportV1File["students"] = get(17010).map((f) => {
    const id = Number(f[1]);
    const mem = memberships.get(id) ?? new Set<string>();
    // The declared home group (f4) is often blank or stale; the membership table is current.
    const declaredHome = canonicalGroupName(f[4] ?? "");
    const homeGroup = [...mem].find((n) => homeSet.has(n)) ?? (declaredHome && groupNames.has(declaredHome) ? declaredHome : null);
    return {
      name: `Μαθητής ${String(id).padStart(4, "0")}`,
      externalId: f[2]?.trim() || null,
      homeGroup,
      gender: f[7] === "Α" ? "M" : f[7] === "Θ" ? "F" : "NONE",
      groups: [...mem],
    };
  });

  // ── rooms (type 4): name, capacity. DUMMY* and the capacity-116 placeholders are skipped.
  const roomRows = get(4);
  const roomName = (i1: number) => roomRows[i1 - 1]?.[0]?.trim();
  const isRealRoom = (f: string[]) => !!f[0] && !f[0].startsWith("DUMMY") && Number(f[2]) !== 116;
  const rooms: ExportV1File["rooms"] = roomRows.filter(isRealRoom).map((f) => ({ name: f[0].trim(), kind: null, capacity: Number(f[2]) || null, note: null }));
  const realRoomNames = new Set(rooms.map((r) => r.name));
  // type 9: per REL row, 105-bit allowed-room mask (1 = allowed), in room row order
  const allowedMask = new Map<number, string>(get(9).map((f) => [Number(f[0]), f[1]]));

  // ── lessons (REL type 3) with their pool from RES (the only place Orologio keeps that link)
  // A RES row names (teacher, subject, cls, slot); the group is recovered by matching each
  // lesson of that teacher+subject to a (cls, slot) key with the same number of rows that
  // fits the lesson's group — most constrained lesson first, as in the timetable analysis.
  const realCount = realClasses.filter((c) => c.real).length;
  // A virtual class is a pool (lessons placed together) only when it has ≥ 2 sub-slots;
  // with one sub-slot it is just the container of a merged group's ordinary lessons.
  const slotsOfClass = new Map<number, Set<number>>();
  for (const r of res) {
    if (!slotsOfClass.has(r.cls)) slotsOfClass.set(r.cls, new Set());
    slotsOfClass.get(r.cls)!.add(r.slot);
  }
  const isPool = (cls: number) => cls > realCount && (slotsOfClass.get(cls)?.size ?? 0) >= 2;
  const resKeys = new Map<string, Map<string, number>>(); // "t|s" → "cls-slot" → row count
  for (const r of res) {
    const ts = `${r.teacher}|${r.subject}`;
    if (!resKeys.has(ts)) resKeys.set(ts, new Map());
    const key = `${r.cls}-${r.slot}`;
    resKeys.get(ts)!.set(key, (resKeys.get(ts)!.get(key) ?? 0) + 1);
  }
  const fits = (cls: number, slot: number, gid: number): boolean => {
    if (cls <= realCount) return homeByClassSlot.get(`${cls}-${slot}`) === gid;
    const mem = poolMembers.get(cls);
    if (!mem) return false;
    const own = classSlotOfHome.get(gid);
    if (own && mem.has(own)) return true;
    const m41 = members41.get(gid);
    return !!m41 && [...m41].every((x) => mem.has(x));
  };
  const relRows = R.get(3) ?? [];
  const poolOfLesson = new Map<number, string>(); // REL row index → pool name
  const slotsOfLesson = new Map<number, FixedSlot[]>(); // REL row index → placed days/periods (from RES)
  const roomsOfLesson = new Map<number, string[]>(); // REL row index → rooms used in the result, most used first
  const rowsByKey = new Map<string, ResRow[]>(); // "t|s|cls-slot" → rows
  for (const r of res) {
    const k = `${r.teacher}|${r.subject}|${r.cls}-${r.slot}`;
    if (!rowsByKey.has(k)) rowsByKey.set(k, []);
    rowsByKey.get(k)!.push(r);
  }
  const byTS = new Map<string, number[]>();
  relRows.forEach((f, i) => {
    const ts = `${Number(f[0])}|${Number(f[2])}`;
    if (!byTS.has(ts)) byTS.set(ts, []);
    byTS.get(ts)!.push(i);
  });
  for (const [ts, lessonIdx] of byTS) {
    const keys = resKeys.get(ts);
    if (!keys) continue;
    const free = new Map(keys);
    const pending = new Set(lessonIdx);
    const candidates = (i: number) => {
      const gid = Number(relRows[i][1]), hours = Number(relRows[i][3]);
      return [...free.entries()].filter(([key, n]) => {
        const [cls, slot] = key.split("-").map(Number);
        return n === hours && fits(cls, slot, gid);
      }).map(([key]) => key);
    };
    while (pending.size) {
      let best: number | null = null, bestCands: string[] = [];
      for (const i of pending) {
        const c = candidates(i);
        if (best === null || (c.length > 0 && (bestCands.length === 0 || c.length < bestCands.length))) { best = i; bestCands = c; }
      }
      if (best === null) break;
      pending.delete(best);
      if (bestCands.length === 0) continue; // nothing fits (e.g. unplaced lesson) → no pool
      const key = bestCands[0];
      free.delete(key);
      const cls = Number(key.split("-")[0]);
      if (isPool(cls)) poolOfLesson.set(best, realClasses[cls - 1].name);
      const byDay = new Map<number, number[]>();
      const used = new Map<string, number>();
      for (const r of rowsByKey.get(`${ts}|${key}`) ?? []) {
        byDay.set(r.day, [...(byDay.get(r.day) ?? []), r.period]);
        const rn = roomName(r.room);
        if (rn && realRoomNames.has(rn)) used.set(rn, (used.get(rn) ?? 0) + 1);
      }
      roomsOfLesson.set(best, [...used.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n));
      slotsOfLesson.set(best, [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, periods]) => ({ day, periods: periods.sort((a, b) => a - b) })));
    }
  }
  const poolNames = new Set(poolOfLesson.values());
  const lessonsWithPool = poolOfLesson.size;
  const lessons: ExportV1File["lessons"] = relRows.map((f, i) => {
    const t = Number(f[0]), gid = Number(f[1]), s = Number(f[2]), hours = Number(f[3]);
    const subj = subjectOf(s);
    const g = groupById.get(gid);
    return {
      subject: subj.name,
      level: subj.level,
      group: g?.name ?? `?${gid}`,
      teacher: teacherName(t),
      periods: hours,
      shape: patternToShape(f[5] ?? "", hours),
      pool: poolOfLesson.get(i) ?? null,
      long: hours >= 6 && /Εργ|ΕΝΤΑΞΗ/.test(subj.name),
      fixedRoom: null,
      ...roomPreference(i),
      // Full-day workshops come pre-assigned to their days: keep the placement as a lock.
      fixedSlots: hours >= 6 && /Εργ|ΕΝΤΑΞΗ/.test(subj.name) ? slotsOfLesson.get(i) ?? null : null,
      note: null,
    };
  });
  // Orologio's allowed-room mask (type 9) → ONLY; otherwise the rooms the result used → PREFER.
  function roomPreference(i: number): { roomMode: "ANY" | "PREFER" | "ONLY"; roomKind: null; rooms: string[]; sameRoom: boolean } {
    const mask = allowedMask.get(i + 1);
    const used = roomsOfLesson.get(i) ?? [];
    if (mask && mask.includes("0")) {
      const allowed = roomRows.map((f, j) => (mask[j] === "1" && isRealRoom(f) ? f[0].trim() : null)).filter((x): x is string => !!x);
      const ordered = [...used.filter((r) => allowed.includes(r)), ...allowed.filter((r) => !used.includes(r))];
      return { roomMode: "ONLY", roomKind: null, rooms: ordered, sameRoom: false };
    }
    return { roomMode: used.length ? "PREFER" : "ANY", roomKind: null, rooms: used, sameRoom: false };
  }

  const pools: ExportV1File["pools"] = [...poolNames].sort().map((name) => ({
    name,
    kind: /ΕΠΙΛ/.test(name) ? "BAND" : /ΑΓΓΛ|ΜΑΘ$|ΓΛ\d?$/.test(name) ? "BAND" : /^(ΓΑΛ|ΘΡΗ|ΙΣΤ|ΧΗΜ|ΣΤ)_/.test(name) ? "LANGUAGE" : "MERGED",
    note: null,
    fixedSlots: null,
  }));

  const v1: ExportV1File = {
    format: "school-scheduler",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { daysPeriods: [8, 7, 7, 8, 7], ...(schoolName ? { schoolName } : {}) },
    teachers,
    subjects: [...subjectKeySet.values()],
    groups,
    students,
    pools,
    rooms,
    lessons,
    rules: [],
  };
  // The zone grid: a pool's slots are the slots every lesson of the pool was placed on.
  for (const pool of v1.pools) {
    const members = lessons.map((l, i) => [l, i] as const).filter(([l]) => l.pool === pool.name);
    const sets = members.map(([, i]) => new Set((slotsOfLesson.get(i) ?? []).flatMap((s) => s.periods.map((p) => s.day * 100 + p))));
    if (!sets.length || sets.some((s) => s.size === 0)) continue;
    const common = [...sets[0]].filter((x) => sets.every((s) => s.has(x))).sort((a, b) => a - b);
    if (!common.length) continue;
    const byDay = new Map<number, number[]>();
    for (const x of common) byDay.set(Math.floor(x / 100), [...(byDay.get(Math.floor(x / 100)) ?? []), x % 100]);
    pool.fixedSlots = [...byDay.entries()].map(([day, periods]) => ({ day, periods }));
  }
  const { file, report: structure } = upgradeV1(v1);
  return {
    file,
    report: {
      teachers: teachers.length,
      subjects: file.subjects.length,
      groups: groups.length,
      mergedDuplicateGroups,
      students: students.length,
      memberships: membershipCount,
      pools: pools.length,
      lessons: lessons.length,
      lessonsWithPool,
      unavailability: [...unav.values()].reduce((a, v) => a + v.length, 0),
      structure,
    },
  };
}
