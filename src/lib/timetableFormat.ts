// The solver's result file (solver/report.py write_json) and how it is attached to the
// database. Lesson keys (L0001…) are positional in the export, so they are resolved against the
// export order at import time and stored as lesson ids.

import { z } from "zod";

export const TimetablePlacementSchema = z.object({
  lesson: z.string(),
  day: z.number().int().min(1).max(5),
  period: z.number().int().min(1).max(12),
  room: z.string().nullable().optional(),
});

/** What identifies a lesson independently of ids and keys. Written by the solver
 *  (report.py) per key; also derivable from an export file or from the database. */
export const LessonIdentitySchema = z.object({
  subject: z.string(),
  level: z.string().default("NONE"),
  homeGroups: z.array(z.string()),
  teacher: z.string().nullable(),
  periods: z.number().int(),
  audience: z.enum(["ALL", "SUBSET"]).default("ALL"),
  students: z.array(z.string()).nullable().default(null),
  band: z.string().nullable().default(null),
  excused: z.array(z.string()).nullable().default(null), // pupils excused from this lesson (ΑΣΤ/ΕΞΣΤ) — tells identical parts apart
});
export type LessonIdentity = z.infer<typeof LessonIdentitySchema>;

export function identityKey(l: LessonIdentity): string {
  return [l.subject, l.level, [...l.homeGroups].sort().join("+"), l.teacher ?? "", l.periods, l.audience, l.audience === "SUBSET" ? [...(l.students ?? [])].sort().join(",") : "", l.band ?? "", [...(l.excused ?? [])].sort().join(",")].join("|");
}

export const TimetableFileSchema = z.object({
  format: z.literal("school-scheduler-timetable"),
  version: z.literal(1),
  source: z.string().optional(),
  createdAt: z.string().optional(),
  status: z.string().default("UNKNOWN"),
  objective: z.number().nullable().optional(),
  bound: z.number().nullable().optional(),
  penalties: z.record(z.string(), z.number()).default({}),
  contradictoryPupils: z.array(z.string()).default([]),
  unresolvedPupils: z.array(z.string()).default([]),
  rules: z.record(z.string(), z.object({ mode: z.string(), weight: z.number() })).optional(),
  seconds: z.number().optional(),
  lessons: z.record(z.string(), LessonIdentitySchema).optional(), // key → identity (newer files)
  placements: z.array(TimetablePlacementSchema),
});

export type TimetableFile = z.infer<typeof TimetableFileSchema>;

export type TimetableSummary = {
  source: string | null;
  objective: number | null;
  bound: number | null;
  penalties: Record<string, number>;
  contradictoryPupils: string[];
  unresolvedPupils: string[];
  seconds: number | null;
  problems: string[];
};

export function summaryOf(file: TimetableFile, problems: string[]): TimetableSummary {
  return {
    source: file.source ?? null,
    objective: file.objective ?? null,
    bound: file.bound ?? null,
    penalties: file.penalties,
    contradictoryPupils: file.contradictoryPupils,
    unresolvedPupils: file.unresolvedPupils,
    seconds: file.seconds ?? null,
    problems,
  };
}

export type TeacherChange = { key: string; lessonId: string; subject: string; homeGroups: string[]; from: string | null; to: string | null };

/** Key → lesson id by matching identities. Several lessons may share one identity (true
 *  duplicates); they are paired in order. A lesson whose teacher was changed after the solve
 *  (everything else equal) is still matched and reported in `teacherChanged`. Keys without a
 *  match are reported in `unmatched`. */
export function keysByIdentity(
  fileLessons: Record<string, LessonIdentity>,
  dbLessons: { id: string; identity: LessonIdentity }[],
): { keyOf: Map<string, string>; unmatched: string[]; teacherChanged: TeacherChange[] } {
  const pool = new Map<string, string[]>();
  for (const l of dbLessons) {
    const k = identityKey(l.identity);
    pool.set(k, [...(pool.get(k) ?? []), l.id]);
  }
  const keyOf = new Map<string, string>();
  const missing: string[] = [];
  for (const key of Object.keys(fileLessons).sort()) {
    const ids = pool.get(identityKey(fileLessons[key]));
    const id = ids?.shift();
    if (id) keyOf.set(key, id);
    else missing.push(key);
  }
  // second pass: the same lesson with another teacher, among the lessons nobody matched
  const used = new Set(keyOf.values());
  const noTeacher = (i: LessonIdentity) => identityKey({ ...i, teacher: null });
  const loose = new Map<string, { id: string; identity: LessonIdentity }[]>();
  for (const l of dbLessons) {
    if (used.has(l.id)) continue;
    const k = noTeacher(l.identity);
    loose.set(k, [...(loose.get(k) ?? []), l]);
  }
  const unmatched: string[] = [];
  const teacherChanged: TeacherChange[] = [];
  for (const key of missing) {
    const f = fileLessons[key];
    const l = loose.get(noTeacher(f))?.shift();
    if (!l) {
      unmatched.push(key);
      continue;
    }
    keyOf.set(key, l.id);
    teacherChanged.push({ key, lessonId: l.id, subject: f.subject, homeGroups: f.homeGroups, from: f.teacher, to: l.identity.teacher });
  }
  return { keyOf, unmatched, teacherChanged };
}

export type ResolvedPlacement = { lessonId: string; day: number; period: number; room: string | null };

/** Map the file's lesson keys to lesson ids. `keyOf` is key → lesson id in the current export
 *  order; `periodsOf` lesson id → periods. Problems: unknown keys (the lessons changed since the
 *  export the solver used) and lessons whose placed periods differ from their length. */
export function resolvePlacements(
  file: TimetableFile,
  keyOf: Map<string, string>,
  periodsOf: Map<string, number>,
): { placements: ResolvedPlacement[]; unknownKeys: string[]; problems: string[] } {
  const placements: ResolvedPlacement[] = [];
  const unknown = new Set<string>();
  const count = new Map<string, number>();
  for (const p of file.placements) {
    const lessonId = keyOf.get(p.lesson);
    if (!lessonId) {
      unknown.add(p.lesson);
      continue;
    }
    placements.push({ lessonId, day: p.day, period: p.period, room: p.room ?? null });
    count.set(lessonId, (count.get(lessonId) ?? 0) + 1);
  }
  const problems: string[] = [];
  for (const [lessonId, periods] of periodsOf) {
    const placed = count.get(lessonId) ?? 0;
    if (placed !== periods) problems.push(`${lessonId}: ${placed}/${periods}`);
  }
  return { placements, unknownKeys: [...unknown].sort(), problems };
}
