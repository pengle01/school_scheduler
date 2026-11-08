import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, adminProcedure } from "../init";
import { countImport, danglingReferences, studentRef, type ExportFile, type FixedSlot } from "@/lib/exportFormat";
import { applyImport, parseExportFile, ImportError } from "@/server/import";
import { ensureRulesSeeded } from "./rules";
import type { Context } from "../context";

export async function buildExport(db: Context["db"]): Promise<ExportFile> {
  await ensureRulesSeeded(db);
  const [teachers, subjects, homeGroups, students, bands, rooms, lessons, rules, settings] = await Promise.all([
    db.teacher.findMany({ include: { unavailability: true }, orderBy: { name: "asc" } }),
    db.subject.findMany({ orderBy: [{ name: "asc" }, { level: "asc" }] }),
    db.homeGroup.findMany({ orderBy: { name: "asc" } }),
    db.student.findMany({ include: { homeGroup: { select: { name: true } }, excusals: { select: { lessonId: true } } }, orderBy: { name: "asc" } }),
    db.band.findMany({ orderBy: { name: "asc" } }),
    db.room.findMany({ orderBy: { name: "asc" } }),
    db.lesson.findMany({
      include: {
        subject: true,
        teacher: true,
        band: true,
        rooms: { include: { room: { select: { name: true } } }, orderBy: { rank: "asc" } },
        homeGroups: { include: { homeGroup: { select: { name: true } } } },
        students: { include: { student: { select: { externalId: true, name: true } } } },
      },
      orderBy: [{ subject: { name: "asc" } }, { id: "asc" }],
    }),
    db.rule.findMany({ include: { overrides: { include: { teacher: { select: { name: true } } } } } }),
    db.setting.findMany(),
  ]);
  // Stable keys: hosts before their support lessons is not required (keys are resolved after all are read).
  const keyOf = new Map(lessons.map((l, i) => [l.id, `L${String(i + 1).padStart(4, "0")}`]));
  return {
    format: "school-scheduler",
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
    teachers: teachers.map((t) => ({
      name: t.name,
      firstName: t.firstName,
      department: t.department,
      obligation: t.obligation,
      reduction: t.reduction,
      active: t.active,
      note: t.note,
      unavailability: t.unavailability.map((u) => ({ day: u.day, period: u.period, kind: u.kind })),
    })),
    subjects: subjects.map((s) => ({ name: s.name, code: s.code, level: s.level, periodsPerWeek: s.periodsPerWeek, note: s.note })),
    homeGroups: homeGroups.map((g) => ({ name: g.name, year: g.year, direction: g.direction, note: g.note })),
    students: students.map((s) => ({ name: s.name, externalId: s.externalId, homeGroup: s.homeGroup?.name ?? null, gender: s.gender, excusedFrom: s.excusals.map((e) => keyOf.get(e.lessonId)!).sort() })),
    bands: bands.map((b) => ({ name: b.name, kind: b.kind, note: b.note, fixedSlots: (b.fixedSlots as FixedSlot[] | null) ?? null })),
    rooms: rooms.map((r) => ({ name: r.name, kind: r.kind, capacity: r.capacity, note: r.note })),
    lessons: lessons.map((l) => ({
      key: keyOf.get(l.id)!,
      subject: l.subject.name,
      level: l.subject.level,
      homeGroups: l.homeGroups.map((h) => h.homeGroup.name).sort(),
      teacher: l.teacher?.name ?? null,
      periods: l.periods,
      shape: l.shape,
      audience: l.audience,
      students: l.audience === "SUBSET" ? l.students.map((s) => studentRef(s.student)).sort() : null,
      during: l.hostLessonId ? keyOf.get(l.hostLessonId) ?? null : null,
      supportKind: l.supportKind,
      band: l.band?.name ?? null,
      long: l.long,
      fixedRoom: l.fixedRoom,
      roomMode: l.roomMode,
      roomKind: l.roomKind,
      sameRoom: l.sameRoom,
      rooms: l.rooms.map((x) => x.room.name),
      fixedSlots: (l.fixedSlots as FixedSlot[] | null) ?? null,
      note: l.note,
    })),
    rules: rules.map((r) => ({
      code: r.code,
      mode: r.mode,
      weight: r.weight,
      params: (r.params ?? {}) as Record<string, unknown>,
      overrides: r.overrides.map((o) => ({ teacher: o.teacher.name, mode: o.mode, weight: o.weight })),
    })),
  };
}

export const dataRouter = createTRPCRouter({
  export: publicProcedure.query(({ ctx }) => buildExport(ctx.db)),

  import: adminProcedure
    .input(z.object({ text: z.string(), mode: z.enum(["merge", "replace"]), dryRun: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      let file: ExportFile;
      try {
        file = parseExportFile(input.text);
      } catch (e) {
        if (e instanceof ImportError) throw new TRPCError({ code: "BAD_REQUEST", message: e.key });
        throw e;
      }
      const counts = countImport(file);
      const problems = danglingReferences(file);
      if (input.dryRun) return { applied: false, counts, problems };
      if (problems.length) throw new TRPCError({ code: "BAD_REQUEST", message: "dangling" });
      await applyImport(ctx.db, file, input.mode);
      return { applied: true, counts, problems };
    }),
});
