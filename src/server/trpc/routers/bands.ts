import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, adminProcedure } from "../init";
import { rethrowAsConflict } from "../errors";
import { bandCheck, type LessonLike } from "@/lib/structure";
import { lessonInclude } from "./homeGroups";
import { FixedSlotSchema, type FixedSlot } from "@/lib/exportFormat";
import { Prisma } from "@/generated/prisma/client";

export const bandKindEnum = z.enum(["ELECTIVE", "LEVEL", "PARALLEL"]);

const input = z.object({
  name: z.string().trim().min(1),
  kind: bandKindEnum,
  note: z.string().trim().nullable().optional(),
});

export const bandsRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    const bands = await ctx.db.band.findMany({
      include: { lessons: { select: { periods: true, homeGroups: { select: { homeGroup: { select: { name: true } } } } } } },
      orderBy: { name: "asc" },
    });
    return bands.map(({ lessons, ...b }) => ({
      ...b,
      fixedSlots: (b.fixedSlots as FixedSlot[] | null) ?? null,
      options: lessons.length,
      periods: lessons[0]?.periods ?? null,
      mismatch: new Set(lessons.map((l) => l.periods)).size > 1,
      homeGroups: [...new Set(lessons.flatMap((l) => l.homeGroups.map((h) => h.homeGroup.name)))].sort(),
    }));
  }),

  // The zone grid: lock a zone to its slots (null = free for the solver).
  setFixedSlots: adminProcedure.input(z.object({ id: z.string(), fixedSlots: z.array(FixedSlotSchema).nullable() })).mutation(({ ctx, input }) =>
    ctx.db.band.update({ where: { id: input.id }, data: { fixedSlots: input.fixedSlots === null ? Prisma.JsonNull : (input.fixedSlots as Prisma.InputJsonValue) } }),
  ),

  // Everything the zone grid screen needs: each zone with its options (teacher, pupils, home groups).
  grid: publicProcedure.query(async ({ ctx }) => {
    const bands = await ctx.db.band.findMany({
      include: {
        lessons: {
          select: {
            id: true,
            periods: true,
            teacherId: true,
            audience: true,
            teacher: { select: { name: true } },
            subject: { select: { name: true } },
            homeGroups: { select: { homeGroupId: true, homeGroup: { select: { name: true } } } },
            students: { select: { studentId: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });
    const groups = await ctx.db.homeGroup.findMany({ select: { id: true, students: { select: { id: true } } } });
    const pupilsOfGroup = new Map(groups.map((g) => [g.id, g.students.map((s) => s.id)]));
    return bands.map((b) => ({
      id: b.id,
      name: b.name,
      kind: b.kind,
      fixedSlots: (b.fixedSlots as FixedSlot[] | null) ?? null,
      options: b.lessons.map((l) => ({
        id: l.id,
        subject: l.subject.name,
        periods: l.periods,
        teacherId: l.teacherId,
        teacher: l.teacher?.name ?? null,
        homeGroups: l.homeGroups.map((h) => h.homeGroup.name),
        pupils: l.audience === "SUBSET" ? l.students.map((s) => s.studentId) : l.homeGroups.flatMap((h) => pupilsOfGroup.get(h.homeGroupId) ?? []),
      })),
    }));
  }),

  options: publicProcedure.query(({ ctx }) => ctx.db.band.findMany({ select: { id: true, name: true, kind: true }, orderBy: { name: "asc" } })),

  byId: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const band = await ctx.db.band.findUnique({
      where: { id: input.id },
      include: { lessons: { include: lessonInclude, orderBy: [{ subject: { name: "asc" } }] } },
    });
    if (!band) throw new TRPCError({ code: "NOT_FOUND" });
    const hgIds = [...new Set(band.lessons.flatMap((l) => l.homeGroups.map((h) => h.homeGroupId)))];
    const groups = await ctx.db.homeGroup.findMany({ where: { id: { in: hgIds } }, include: { students: { select: { id: true } } } });
    const pupils = new Map(groups.map((g) => [g.name, new Set(g.students.map((s) => s.id))]));
    const like = (l: (typeof band.lessons)[number]): LessonLike => ({
      key: l.id,
      homeGroups: l.homeGroups.map((h) => h.homeGroup.name),
      audience: l.audience,
      students: l.students.map((s) => s.studentId),
      during: l.hostLessonId,
      periods: l.periods,
      band: l.bandId,
    });
    return { ...band, homeGroupNames: groups.map((g) => g.name).sort(), check: bandCheck(band.lessons.map(like), pupils) };
  }),

  create: adminProcedure.input(input).mutation(async ({ ctx, input }) => {
    try {
      return await ctx.db.band.create({ data: input });
    } catch (e) {
      rethrowAsConflict(e);
    }
  }),

  update: adminProcedure.input(input.partial().extend({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    try {
      return await ctx.db.band.update({ where: { id }, data });
    } catch (e) {
      rethrowAsConflict(e);
    }
  }),

  // Lessons keep existing, just without a band (SetNull).
  remove: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    try {
      await ctx.db.band.delete({ where: { id: input.id } });
    } catch (e) {
      rethrowAsConflict(e);
    }
    return { ok: true };
  }),
});
