// Import of the app's JSON export into the database. Used by the tRPC `data` router
// (UI) and by scripts/import-json.mts (CLI). Name-based: records are matched by name.
// v1 files (groups + pools) are upgraded to v2 structures on read.

import { randomUUID } from "node:crypto";
import { ExportV1Schema, ExportV2Schema, normalizeSupport, subjectKey, studentRef, type ExportFile, type ImportMode } from "@/lib/exportFormat";
import { upgradeV1 } from "@/lib/structure";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

export class ImportError extends Error {
  constructor(public readonly key: "badJson" | "badFormat" | "badTimetable" | "timetableMismatch" | "timetableNoLessons") {
    super(key);
  }
}

export function parseExportFile(text: string): ExportFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportError("badJson");
  }
  const v2 = ExportV2Schema.safeParse(json);
  if (v2.success) return normalizeSupport(v2.data);
  const v1 = ExportV1Schema.safeParse(json);
  if (v1.success) return normalizeSupport(upgradeV1(v1.data).file);
  throw new ImportError("badFormat");
}

// merge: upsert by name; replace: wipe everything first. One transaction either way.
// Lessons have no natural key, so the lesson list is replaced wholesale in both modes.
export async function applyImport(db: PrismaClient, file: ExportFile, mode: ImportMode): Promise<void> {
  await db.$transaction(
    async (tx) => {
      await tx.lesson.deleteMany(); // cascades to LessonHomeGroup / LessonStudent
      if (mode === "replace") {
        await tx.student.deleteMany();
        await tx.room.deleteMany();
        await tx.ruleOverride.deleteMany();
        await tx.teacherUnavailability.deleteMany();
        await tx.band.deleteMany();
        await tx.homeGroup.deleteMany();
        await tx.subject.deleteMany();
        await tx.teacher.deleteMany();
        await tx.setting.deleteMany();
      }
      for (const [key, value] of Object.entries(file.settings)) {
        await tx.setting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue }, update: { value: value as Prisma.InputJsonValue } });
      }

      const teacherId = new Map<string, string>();
      for (const t of file.teachers) {
        const { unavailability, ...data } = t;
        const row = await tx.teacher.upsert({ where: { name: t.name }, create: data, update: data });
        teacherId.set(t.name, row.id);
        await tx.teacherUnavailability.deleteMany({ where: { teacherId: row.id } });
        if (unavailability.length)
          await tx.teacherUnavailability.createMany({ data: unavailability.map((u) => ({ ...u, teacherId: row.id })), skipDuplicates: true });
      }

      const subjectId = new Map<string, string>();
      for (const s of file.subjects) {
        const row = await tx.subject.upsert({ where: { name_level: { name: s.name, level: s.level } }, create: s, update: s });
        subjectId.set(subjectKey(s), row.id);
      }

      const homeGroupId = new Map<string, string>();
      for (const g of file.homeGroups) {
        const row = await tx.homeGroup.upsert({ where: { name: g.name }, create: g, update: g });
        homeGroupId.set(g.name, row.id);
      }

      const bandId = new Map<string, string>();
      for (const b of file.bands) {
        const data = { name: b.name, kind: b.kind, note: b.note, fixedSlots: (b.fixedSlots ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull };
        const row = await tx.band.upsert({ where: { name: b.name }, create: data, update: data });
        bandId.set(b.name, row.id);
      }
      const roomId = new Map<string, string>();
      for (const r of file.rooms) {
        const row = await tx.room.upsert({ where: { name: r.name }, create: r, update: r });
        roomId.set(r.name, row.id);
      }

      // Students: match on externalId, else on name + home group (merge); plain create (replace).
      const studentId = new Map<string, string>();
      if (mode === "replace") {
        const rows = file.students.map((s) => ({
          id: randomUUID(),
          name: s.name,
          externalId: s.externalId,
          gender: s.gender,
          homeGroupId: s.homeGroup ? homeGroupId.get(s.homeGroup) ?? null : null,
        }));
        if (rows.length) await tx.student.createMany({ data: rows });
        file.students.forEach((s, i) => studentId.set(studentRef(s), rows[i].id));
      } else {
        for (const s of file.students) {
          const data = { name: s.name, externalId: s.externalId, gender: s.gender, homeGroupId: s.homeGroup ? homeGroupId.get(s.homeGroup) ?? null : null };
          const existing = s.externalId
            ? await tx.student.findFirst({ where: { externalId: s.externalId } })
            : await tx.student.findFirst({ where: { name: s.name, homeGroupId: data.homeGroupId } });
          const row = existing ? await tx.student.update({ where: { id: existing.id }, data }) : await tx.student.create({ data });
          studentId.set(studentRef(s), row.id);
        }
      }

      // Lessons: ids pre-assigned so `during` can be written in the same createMany.
      const lessonId = new Map(file.lessons.map((l) => [l.key, randomUUID()]));
      if (file.lessons.length) {
        await tx.lesson.createMany({
          data: file.lessons.map((l) => ({
            id: lessonId.get(l.key)!,
            subjectId: subjectId.get(subjectKey({ name: l.subject, level: l.level }))!,
            teacherId: l.teacher ? teacherId.get(l.teacher) ?? null : null,
            periods: l.periods,
            shape: l.shape,
            audience: l.audience,
            hostLessonId: l.during ? lessonId.get(l.during) ?? null : null,
            supportKind: l.supportKind,
            bandId: l.band ? bandId.get(l.band) ?? null : null,
            long: l.long,
            fixedRoom: l.fixedRoom,
            roomMode: l.roomMode,
            roomKind: l.roomKind,
            sameRoom: l.sameRoom,
            fixedSlots: l.fixedSlots ? (l.fixedSlots as unknown as Prisma.InputJsonValue) : undefined,
            note: l.note,
          })),
        });
        const roomRows = file.lessons.flatMap((l) => l.rooms.filter((r) => roomId.has(r)).map((r, rank) => ({ lessonId: lessonId.get(l.key)!, roomId: roomId.get(r)!, rank })));
        if (roomRows.length) await tx.lessonRoom.createMany({ data: roomRows, skipDuplicates: true });
        await tx.lessonHomeGroup.createMany({
          data: file.lessons.flatMap((l) => l.homeGroups.filter((g) => homeGroupId.has(g)).map((g) => ({ lessonId: lessonId.get(l.key)!, homeGroupId: homeGroupId.get(g)! }))),
          skipDuplicates: true,
        });
        const pupilRows = file.lessons.flatMap((l) =>
          l.audience === "SUBSET" && l.students ? l.students.filter((s) => studentId.has(s)).map((s) => ({ lessonId: lessonId.get(l.key)!, studentId: studentId.get(s)! })) : [],
        );
        if (pupilRows.length) await tx.lessonStudent.createMany({ data: pupilRows, skipDuplicates: true });
        const excusalRows = file.students.flatMap((s) =>
          studentId.has(studentRef(s)) ? s.excusedFrom.filter((k) => lessonId.has(k)).map((k) => ({ studentId: studentId.get(studentRef(s))!, lessonId: lessonId.get(k)! })) : [],
        );
        if (excusalRows.length) await tx.studentExcusal.createMany({ data: excusalRows, skipDuplicates: true });
      }

      for (const r of file.rules) {
        const row = await tx.rule.upsert({
          where: { code: r.code },
          create: { code: r.code, mode: r.mode, weight: r.weight, params: r.params as Prisma.InputJsonValue },
          update: { mode: r.mode, weight: r.weight, params: r.params as Prisma.InputJsonValue },
        });
        await tx.ruleOverride.deleteMany({ where: { ruleId: row.id } });
        const overrides = r.overrides.filter((o) => teacherId.has(o.teacher));
        if (overrides.length)
          await tx.ruleOverride.createMany({ data: overrides.map((o) => ({ ruleId: row.id, teacherId: teacherId.get(o.teacher)!, mode: o.mode, weight: o.weight })) });
      }
    },
    { timeout: 300_000, maxWait: 30_000 },
  );
}
