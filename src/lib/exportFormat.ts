// The JSON the app exports and imports, and the solver's input format. Name-based:
// teachers and home groups by name, subjects by name+level, students by externalId or
// name, lessons by a stable `key` (used by `during`).
//
// v2 (model B): home groups, bands and lessons with structure (audience, during, band,
// fixedSlots). v1 files (groups + pools, from the first release and the first Orologio
// converter) are still accepted and upgraded on read — see upgradeV1 in structure.ts.

import { z } from "zod";

const level = z.enum(["A", "B", "C", "NONE"]);
const year = z.enum(["A", "B", "C", "NONE"]);
const direction = z.enum(["THEORY", "PRACTICE", "HOTEL", "SPECIAL", "NONE"]);
const gender = z.enum(["M", "F", "NONE"]);
const strength = z.enum(["HARD", "SOFT"]);
const ruleMode = z.enum(["HARD", "SOFT", "OFF"]);
const audience = z.enum(["ALL", "SUBSET"]);
const supportKind = z.enum(["ST", "EXST", "AST"]);
const bandKind = z.enum(["ELECTIVE", "LEVEL", "PARALLEL"]);
const roomMode = z.enum(["ANY", "PREFER", "ONLY"]);

const room = z.object({
  name: z.string().min(1),
  kind: z.string().nullable().default(null),
  capacity: z.number().int().nullable().default(null),
  note: z.string().nullable().default(null),
});

export const subjectKey = (s: { name: string; level: string }) => `${s.name}|${s.level}`;

const teacher = z.object({
  name: z.string().min(1),
  firstName: z.string().nullable().default(null),
  department: z.string().nullable().default(null),
  obligation: z.number().int().min(0),
  reduction: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  note: z.string().nullable().default(null),
  unavailability: z
    .array(z.object({ day: z.number().int().min(1).max(7), period: z.number().int().min(1).max(12), kind: strength }))
    .default([]),
});

const subject = z.object({
  name: z.string().min(1),
  code: z.string().nullable().default(null),
  level: level.default("NONE"),
  periodsPerWeek: z.number().int().nullable().default(null),
  note: z.string().nullable().default(null),
});

const rule = z.object({
  code: z.string(),
  mode: ruleMode,
  weight: z.number().int(),
  params: z.record(z.string(), z.unknown()).default({}),
  overrides: z.array(z.object({ teacher: z.string(), mode: ruleMode, weight: z.number().int() })).default([]),
});

export const FixedSlotSchema = z.object({ day: z.number().int().min(1).max(7), periods: z.array(z.number().int().min(1).max(12)).min(1) });
export type FixedSlot = z.infer<typeof FixedSlotSchema>;

// ── v2 ──────────────────────────────────────────────────────────────────────────

export const LessonV2Schema = z.object({
  key: z.string().min(1),
  subject: z.string().min(1),
  level: level.default("NONE"),
  homeGroups: z.array(z.string().min(1)).min(1),
  teacher: z.string().nullable().default(null),
  periods: z.number().int().min(1),
  shape: z.string(),
  audience: audience.default("ALL"),
  // pupil ids (externalId, else name) when audience = SUBSET
  students: z.array(z.string()).nullable().default(null),
  during: z.string().nullable().default(null),
  supportKind: supportKind.nullable().default(null),
  band: z.string().nullable().default(null),
  long: z.boolean().default(false),
  fixedRoom: z.string().nullable().default(null),
  roomMode: roomMode.default("ANY"),
  roomKind: z.string().nullable().default(null),
  sameRoom: z.boolean().default(false), // all periods in one room, chosen from the room list
  rooms: z.array(z.string()).default([]),
  fixedSlots: z.array(FixedSlotSchema).nullable().default(null),
  note: z.string().nullable().default(null),
});

export const ExportV2Schema = z.object({
  format: z.literal("school-scheduler"),
  version: z.literal(2),
  exportedAt: z.string(),
  settings: z.record(z.string(), z.unknown()).default({}),
  teachers: z.array(teacher),
  subjects: z.array(subject),
  homeGroups: z.array(
    z.object({
      name: z.string().min(1),
      year: year.default("NONE"),
      direction: direction.default("NONE"),
      note: z.string().nullable().default(null),
    }),
  ),
  students: z.array(
    z.object({
      name: z.string().min(1),
      externalId: z.string().nullable().default(null),
      homeGroup: z.string().nullable().default(null),
      gender: gender.default("NONE"),
      excusedFrom: z.array(z.string()).default([]), // lesson keys the pupil does not attend (ΑΣΤ/ΕΞΣΤ)
    }),
  ),
  bands: z.array(
    z.object({ name: z.string().min(1), kind: bandKind.default("ELECTIVE"), note: z.string().nullable().default(null), fixedSlots: z.array(FixedSlotSchema).nullable().default(null) }),
  ),
  rooms: z.array(room).default([]),
  lessons: z.array(LessonV2Schema),
  rules: z.array(rule),
});

export type ExportFile = z.infer<typeof ExportV2Schema>;
export type LessonV2 = z.infer<typeof LessonV2Schema>;

// ── v1 (read-only, upgraded on import) ───────────────────────────────────────────

export const ExportV1Schema = z.object({
  format: z.literal("school-scheduler"),
  version: z.literal(1),
  exportedAt: z.string(),
  settings: z.record(z.string(), z.unknown()).default({}),
  teachers: z.array(teacher),
  subjects: z.array(subject),
  groups: z.array(
    z.object({
      name: z.string().min(1),
      kind: z.enum(["HOME", "MERGED", "ELECTIVE", "SUPPORT", "PULLOUT"]).default("HOME"),
      year: year.default("NONE"),
      direction: direction.default("NONE"),
      parents: z.array(z.string()).default([]),
      note: z.string().nullable().default(null),
    }),
  ),
  students: z.array(
    z.object({
      name: z.string().min(1),
      externalId: z.string().nullable().default(null),
      homeGroup: z.string().nullable().default(null),
      gender: gender.default("NONE"),
      groups: z.array(z.string()).default([]),
    }),
  ),
  pools: z.array(z.object({ name: z.string().min(1), kind: z.string().default("OTHER"), note: z.string().nullable().default(null), fixedSlots: z.array(FixedSlotSchema).nullable().default(null) })),
  rooms: z.array(room).default([]),
  lessons: z.array(
    z.object({
      subject: z.string().min(1),
      level: level.default("NONE"),
      group: z.string().min(1),
      teacher: z.string().nullable().default(null),
      periods: z.number().int().min(1),
      shape: z.string(),
      pool: z.string().nullable().default(null),
      long: z.boolean().default(false),
      fixedRoom: z.string().nullable().default(null),
      roomMode: roomMode.default("ANY"),
      roomKind: z.string().nullable().default(null),
      sameRoom: z.boolean().default(false),
      rooms: z.array(z.string()).default([]),
      fixedSlots: z.array(FixedSlotSchema).nullable().default(null),
      note: z.string().nullable().default(null),
    }),
  ),
  rules: z.array(rule),
});
export type ExportV1File = z.infer<typeof ExportV1Schema>;

export type ImportMode = "merge" | "replace";

export interface ImportCounts {
  teachers: number;
  subjects: number;
  homeGroups: number;
  students: number;
  bands: number;
  rooms: number;
  lessons: number;
  rules: number;
}

export function countImport(file: ExportFile): ImportCounts {
  return {
    teachers: file.teachers.length,
    subjects: file.subjects.length,
    homeGroups: file.homeGroups.length,
    students: file.students.length,
    bands: file.bands.length,
    rooms: file.rooms.length,
    lessons: file.lessons.length,
    rules: file.rules.length,
  };
}

// The pupil id used in `lessons[].students`
export const studentRef = (s: { externalId: string | null; name: string }) => s.externalId ?? s.name;

// ΣΤ runs during French; ΑΣΤ and ΕΞΣΤ belong to the pupil, who is excused from named lessons.
// Older files gave those two a host: the host becomes an excusal of each of their pupils.
export function normalizeSupport(file: ExportFile): ExportFile {
  const excused = new Map<string, Set<string>>();
  const lessons = file.lessons.map((l) => {
    if (!l.during || (l.supportKind !== "AST" && l.supportKind !== "EXST")) return l;
    for (const s of l.students ?? []) excused.set(s, (excused.get(s) ?? new Set<string>()).add(l.during));
    return { ...l, during: null };
  });
  const students = file.students.map((s) => {
    const extra = excused.get(studentRef(s));
    return extra ? { ...s, excusedFrom: [...new Set([...s.excusedFrom, ...extra])].sort() } : s;
  });
  return { ...file, lessons, students };
}

// Names a record refers to but the file does not define — reported by the dry run.
export function danglingReferences(file: ExportFile): string[] {
  const teachers = new Set(file.teachers.map((t) => t.name));
  const homeGroups = new Set(file.homeGroups.map((g) => g.name));
  const subjects = new Set(file.subjects.map(subjectKey));
  const bands = new Set(file.bands.map((b) => b.name));
  const students = new Set(file.students.map(studentRef));
  const keys = new Set(file.lessons.map((l) => l.key));
  const rooms = new Set(file.rooms.map((r) => r.name));
  const problems: string[] = [];
  if (keys.size !== file.lessons.length) problems.push("lessons: duplicate keys");
  file.lessons.forEach((l, i) => {
    const at = `lessons[${i}]`;
    if (!subjects.has(subjectKey({ name: l.subject, level: l.level }))) problems.push(`${at}.subject=${l.subject}|${l.level}`);
    for (const g of l.homeGroups) if (!homeGroups.has(g)) problems.push(`${at}.homeGroups=${g}`);
    if (l.teacher && !teachers.has(l.teacher)) problems.push(`${at}.teacher=${l.teacher}`);
    if (l.band && !bands.has(l.band)) problems.push(`${at}.band=${l.band}`);
    if (l.during && !keys.has(l.during)) problems.push(`${at}.during=${l.during}`);
    if (l.during && l.band) problems.push(`${at}: both during and band`);
    if (l.supportKind === "ST" && !l.during) problems.push(`${at}: ΣΤ without during`);
    if (l.students) for (const s of l.students) if (!students.has(s)) problems.push(`${at}.students=${s}`);
    for (const r of l.rooms) if (!rooms.has(r)) problems.push(`${at}.rooms=${r}`);
    if (l.roomMode === "ONLY" && l.rooms.length === 0) problems.push(`${at}: roomMode ONLY without rooms`);
  });
  file.students.forEach((s, i) => {
    if (s.homeGroup && !homeGroups.has(s.homeGroup)) problems.push(`students[${i}].homeGroup=${s.homeGroup}`);
    for (const k of s.excusedFrom) if (!keys.has(k)) problems.push(`students[${i}].excusedFrom=${k}`);
  });
  file.rules.forEach((r, i) => {
    for (const o of r.overrides) if (!teachers.has(o.teacher)) problems.push(`rules[${i}].overrides=${o.teacher}`);
  });
  return problems;
}
