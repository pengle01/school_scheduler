import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, adminProcedure } from "../init";
import { rethrowAsConflict } from "../errors";
import { coverageDuring, type LessonLike } from "@/lib/structure";

export const yearEnum = z.enum(["A", "B", "C", "NONE"]);
export const directionEnum = z.enum(["THEORY", "PRACTICE", "HOTEL", "SPECIAL", "NONE"]);

const input = z.object({
  name: z.string().trim().min(1),
  year: yearEnum,
  direction: directionEnum,
  note: z.string().trim().nullable().optional(),
});

export const lessonInclude = {
  subject: true,
  teacher: { select: { id: true, name: true } },
  band: { select: { id: true, name: true, kind: true } },
  rooms: { include: { room: { select: { id: true, name: true } } }, orderBy: { rank: "asc" as const } },
  homeGroups: { include: { homeGroup: { select: { id: true, name: true } } } },
  students: { select: { studentId: true } },
  excusals: { select: { studentId: true } },
  hostLesson: { select: { id: true, subject: { select: { name: true } }, homeGroups: { include: { homeGroup: { select: { name: true } } } } } },
  _count: { select: { supports: true } },
} as const;

export const homeGroupsRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    const groups = await ctx.db.homeGroup.findMany({
      include: {
        _count: { select: { students: true } },
        lessons: { include: { lesson: { select: { periods: true, supportKind: true, bandId: true } } } },
      },
      orderBy: [{ year: "asc" }, { name: "asc" }],
    });
    return groups.map(({ lessons, _count, ...g }) => ({
      ...g,
      students: _count.students,
      // periods a pupil of the group sits through: plain + merged lessons (support and band options run inside others)
      periods: lessons.filter((l) => !l.lesson.supportKind).reduce((a, l) => a + l.lesson.periods, 0),
      lessonCount: lessons.length,
    }));
  }),

  options: publicProcedure.query(({ ctx }) => ctx.db.homeGroup.findMany({ select: { id: true, name: true, year: true }, orderBy: { name: "asc" } })),

  // Everything about one τμήμα: pupils, lessons (grouped by structure), coverage during hosts.
  byId: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const group = await ctx.db.homeGroup.findUnique({
      where: { id: input.id },
      include: { students: { orderBy: { name: "asc" } } },
    });
    if (!group) throw new TRPCError({ code: "NOT_FOUND" });
    const lessons = await ctx.db.lesson.findMany({
      where: { homeGroups: { some: { homeGroupId: input.id } } },
      include: { ...lessonInclude, supports: { include: lessonInclude } },
      orderBy: [{ subject: { name: "asc" } }],
    });
    const pupils = new Map<string, Set<string>>([[group.name, new Set(group.students.map((s) => s.id))]]);
    // Other home groups of merged lessons
    const otherIds = new Set(lessons.flatMap((l) => l.homeGroups.map((h) => h.homeGroupId)).filter((id) => id !== input.id));
    if (otherIds.size) {
      const others = await ctx.db.homeGroup.findMany({ where: { id: { in: [...otherIds] } }, include: { students: { select: { id: true } } } });
      for (const o of others) pupils.set(o.name, new Set(o.students.map((s) => s.id)));
    }
    const like = (l: (typeof lessons)[number] | (typeof lessons)[number]["supports"][number]): LessonLike => ({
      key: l.id,
      homeGroups: l.homeGroups.map((h) => h.homeGroup.name),
      audience: l.audience,
      students: l.students.map((s) => s.studentId),
      during: l.hostLessonId,
      periods: l.periods,
      band: l.bandId,
    });
    const hostLessons = lessons.filter((l) => l.supports.length > 0);
    const bandIds = [...new Set(hostLessons.map((l) => l.bandId).filter((x): x is string => !!x))];
    const siblings = bandIds.length ? await ctx.db.lesson.findMany({ where: { bandId: { in: bandIds } }, include: lessonInclude }) : [];
    const hosts = hostLessons.map((l) => ({
      lessonId: l.id,
      uncovered: coverageDuring(like(l), l.supports.map(like), pupils, siblings.filter((s) => s.bandId === l.bandId && s.id !== l.id).map(like), new Set([l, ...siblings.filter((s) => s.bandId === l.bandId)].flatMap((x) => x.excusals.map((e) => e.studentId)))),
    }));
    return { ...group, lessons, hosts };
  }),

  create: adminProcedure.input(input).mutation(async ({ ctx, input }) => {
    try {
      return await ctx.db.homeGroup.create({ data: input });
    } catch (e) {
      rethrowAsConflict(e);
    }
  }),

  update: adminProcedure.input(input.partial().extend({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    try {
      return await ctx.db.homeGroup.update({ where: { id }, data });
    } catch (e) {
      rethrowAsConflict(e);
    }
  }),

  remove: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const lessons = await ctx.db.lessonHomeGroup.count({ where: { homeGroupId: input.id } });
    if (lessons) throw new TRPCError({ code: "CONFLICT", message: "inUse" });
    try {
      await ctx.db.homeGroup.delete({ where: { id: input.id } });
    } catch (e) {
      rethrowAsConflict(e);
    }
    return { ok: true };
  }),
});
