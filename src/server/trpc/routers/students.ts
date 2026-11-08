import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, adminProcedure } from "../init";
import { rethrowAsConflict } from "../errors";
import { pupilLessonBreakdown, pupilPeriods } from "@/lib/pupilPeriods";

const studentInput = z.object({
  name: z.string().trim().min(1),
  externalId: z.string().trim().nullable().optional(),
  homeGroupId: z.string().nullable().optional(),
  gender: z.enum(["M", "F", "NONE"]),
});

export const studentsRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    const [students, lessons] = await Promise.all([
      ctx.db.student.findMany({
        include: { homeGroup: { select: { id: true, name: true } }, excusals: { select: { lessonId: true } }, lessons: { select: { lesson: { select: { id: true, subject: { select: { name: true } }, supportKind: true, band: { select: { name: true } } } } } } },
        orderBy: [{ homeGroup: { name: "asc" } }, { name: "asc" }],
      }),
      ctx.db.lesson.findMany({
        select: {
          id: true,
          periods: true,
          audience: true,
          hostLessonId: true,
          bandId: true,
          homeGroups: { select: { homeGroupId: true } },
          students: { select: { studentId: true } },
        },
      }),
    ]);
    const periods = pupilPeriods(
      students.map((s) => ({ id: s.id, homeGroupId: s.homeGroupId, excusedFrom: s.excusals.map((e) => e.lessonId) })),
      lessons.map((l) => ({ ...l, homeGroupIds: l.homeGroups.map((h) => h.homeGroupId), studentIds: l.students.map((x) => x.studentId) })),
    );
    return students.map((s) => ({ ...s, periods: periods.get(s.id) ?? 0 }));
  }),

  create: adminProcedure.input(studentInput).mutation(async ({ ctx, input }) => {
    try {
      return await ctx.db.student.create({ data: input });
    } catch (e) {
      rethrowAsConflict(e);
    }
  }),

  update: adminProcedure.input(studentInput.partial().extend({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    try {
      return await ctx.db.student.update({ where: { id }, data });
    } catch (e) {
      rethrowAsConflict(e);
    }
  }),

  remove: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    try {
      await ctx.db.student.delete({ where: { id: input.id } });
    } catch (e) {
      rethrowAsConflict(e);
    }
    return { ok: true };
  }),

  // Everything one pupil sits in, and what they leave and why (the pupil's lessons window).
  lessons: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const student = await ctx.db.student.findUnique({
      where: { id: input.id },
      include: { homeGroup: { select: { name: true } }, excusals: { select: { lessonId: true } } },
    });
    if (!student) throw new TRPCError({ code: "NOT_FOUND" });
    const lessons = await ctx.db.lesson.findMany({
      include: {
        subject: { select: { name: true } },
        teacher: { select: { name: true } },
        band: { select: { name: true } },
        hostLesson: { select: { subject: { select: { name: true } } } },
        homeGroups: { select: { homeGroupId: true, homeGroup: { select: { name: true } } } },
        students: { select: { studentId: true } },
      },
      orderBy: [{ subject: { name: "asc" } }],
    });
    const byId = new Map(lessons.map((l) => [l.id, l]));
    const { attending, left } = pupilLessonBreakdown(
      { id: student.id, homeGroupId: student.homeGroupId, excusedFrom: student.excusals.map((e) => e.lessonId) },
      lessons.map((l) => ({
        id: l.id,
        periods: l.periods,
        audience: l.audience,
        homeGroupIds: l.homeGroups.map((h) => h.homeGroupId),
        studentIds: l.students.map((x) => x.studentId),
        hostLessonId: l.hostLessonId,
        bandId: l.bandId,
      })),
    );
    const row = (id: string) => {
      const l = byId.get(id)!;
      return {
        id,
        subject: l.subject.name,
        teacher: l.teacher?.name ?? null,
        periods: l.periods,
        homeGroups: l.homeGroups.map((h) => h.homeGroup.name),
        band: l.band?.name ?? null,
        supportKind: l.supportKind,
        host: l.hostLesson?.subject.name ?? null,
      };
    };
    const bySubject = <T extends { subject: string }>(a: T, b: T) => a.subject.localeCompare(b.subject);
    const attended = attending.map(row).sort(bySubject);
    return {
      name: student.name,
      externalId: student.externalId,
      homeGroup: student.homeGroup?.name ?? null,
      total: attended.reduce((a, l) => a + l.periods, 0),
      attending: attended,
      left: left.map((x) => ({ ...row(x.id), reason: x.reason })).sort(bySubject),
    };
  }),

  // The lessons a pupil is excused from (given by the ministry).
  setExcusals: adminProcedure.input(z.object({ id: z.string(), lessonIds: z.array(z.string()) })).mutation(async ({ ctx, input }) => {
    await ctx.db.$transaction([
      ctx.db.studentExcusal.deleteMany({ where: { studentId: input.id } }),
      ctx.db.studentExcusal.createMany({ data: [...new Set(input.lessonIds)].map((lessonId) => ({ studentId: input.id, lessonId })) }),
    ]);
    return { ok: true };
  }),

  // Create several students of one home group at once (one name per line).
  bulkCreate: adminProcedure
    .input(z.object({ homeGroupId: z.string(), names: z.array(z.string().trim().min(1)).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const created = await ctx.db.student.createMany({ data: input.names.map((name) => ({ name, homeGroupId: input.homeGroupId })) });
      return { count: created.count };
    }),
});
