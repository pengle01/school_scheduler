// Attach a solver result to the database. Shared by the tRPC `timetables` router and
// scripts/import-timetable.mts.

import type { PrismaClient } from "@/generated/prisma/client";
import { TimetableFileSchema, keysByIdentity, resolvePlacements, summaryOf, type LessonIdentity, type TeacherChange, type TimetableFile } from "@/lib/timetableFormat";
import { studentRef, type ExportFile } from "@/lib/exportFormat";
import { ImportError } from "@/server/import";

export function parseTimetableFile(text: string): TimetableFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError("badJson");
  }
  const parsed = TimetableFileSchema.safeParse(raw);
  if (!parsed.success) throw new ImportError("badTimetable");
  return parsed.data;
}

/** Lesson identities of an export file, by key — for timetable files that predate the
 *  embedded `lessons` map (the CLI reads the file named in `source`). */
export function identitiesOfExport(file: ExportFile): Record<string, LessonIdentity> {
  const excused = new Map<string, string[]>();
  for (const s of file.students) for (const k of s.excusedFrom) excused.set(k, [...(excused.get(k) ?? []), studentRef(s)]);
  return Object.fromEntries(
    file.lessons.map((l) => [
      l.key,
      { subject: l.subject, level: l.level, homeGroups: l.homeGroups, teacher: l.teacher, periods: l.periods, audience: l.audience, students: l.students, band: l.band, excused: excused.get(l.key) ?? [] },
    ]),
  );
}

async function dbIdentities(db: PrismaClient): Promise<{ id: string; periods: number; identity: LessonIdentity }[]> {
  const lessons = await db.lesson.findMany({
    include: {
      subject: { select: { name: true, level: true } },
      teacher: { select: { name: true } },
      band: { select: { name: true } },
      homeGroups: { include: { homeGroup: { select: { name: true } } } },
      students: { include: { student: { select: { externalId: true, name: true } } } },
      excusals: { include: { student: { select: { externalId: true, name: true } } } },
    },
  });
  return lessons.map((l) => ({
    id: l.id,
    periods: l.periods,
    identity: {
      subject: l.subject.name,
      level: l.subject.level,
      homeGroups: l.homeGroups.map((h) => h.homeGroup.name),
      teacher: l.teacher?.name ?? null,
      periods: l.periods,
      audience: l.audience,
      students: l.audience === "SUBSET" ? l.students.map((x) => studentRef(x.student)) : null,
      band: l.band?.name ?? null,
      excused: l.excusals.map((e) => studentRef(e.student)),
    },
  }));
}

/** `identities`: key → lesson identity; the file's own `lessons` map when present. */
export async function importTimetable(
  db: PrismaClient,
  name: string,
  file: TimetableFile,
  identities: Record<string, LessonIdentity> | undefined = file.lessons,
): Promise<{ id: string; placements: number; problems: string[]; teacherChanged: TeacherChange[] }> {
  if (!identities) throw new ImportError("timetableNoLessons");
  const dbLessons = await dbIdentities(db);
  const { keyOf, unmatched, teacherChanged } = keysByIdentity(identities, dbLessons);
  if (unmatched.length) throw new ImportError("timetableMismatch");
  const periodsOf = new Map(dbLessons.map((l) => [l.id, l.periods]));
  const resolved = resolvePlacements(file, keyOf, periodsOf);
  const { placements, unknownKeys } = resolved;
  // a changed teacher was not part of the solve: the new teacher may clash
  const problems = [...resolved.problems, ...teacherChanged.map((c) => `${c.subject} ${c.homeGroups.join("+")}: teacher ${c.from ?? "—"} → ${c.to ?? "—"} since the solve`)];
  if (unknownKeys.length) throw new ImportError("timetableMismatch");
  const rooms = await db.room.findMany({ select: { id: true, name: true } });
  const roomId = new Map(rooms.map((r) => [r.name, r.id]));
  const created = await db.$transaction(async (tx) => {
    const tt = await tx.timetable.create({
      data: {
        name,
        solvedAt: file.createdAt ? new Date(file.createdAt) : null,
        status: file.status,
        summary: summaryOf(file, problems),
      },
    });
    await tx.placement.createMany({
      data: placements.map((p) => ({ timetableId: tt.id, lessonId: p.lessonId, day: p.day, period: p.period, roomId: p.room ? roomId.get(p.room) ?? null : null })),
    });
    return tt;
  });
  return { id: created.id, placements: placements.length, problems, teacherChanged };
}
