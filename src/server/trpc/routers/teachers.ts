import { z } from "zod";
import { createTRPCRouter, publicProcedure, adminProcedure } from "../init";
import { rethrowAsConflict } from "../errors";
import { TRPCError } from "@trpc/server";

const teacherInput = z.object({
  name: z.string().trim().min(1),
  firstName: z.string().trim().nullable().optional(),
  department: z.string().trim().nullable().optional(),
  obligation: z.number().int().min(0).max(40),
  reduction: z.number().int().min(0).max(40),
  active: z.boolean(),
  note: z.string().trim().nullable().optional(),
});

const slot = z.object({
  day: z.number().int().min(1).max(7),
  period: z.number().int().min(1).max(12),
  kind: z.enum(["HARD", "SOFT"]),
});

export const teachersRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    const teachers = await ctx.db.teacher.findMany({
      include: { lessons: { select: { periods: true } }, _count: { select: { unavailability: true } } },
      orderBy: { name: "asc" },
    });
    return teachers.map(({ lessons, ...t }) => ({
      ...t,
      assigned: lessons.reduce((a, l) => a + l.periods, 0),
      lessonCount: lessons.length,
    }));
  }),

  byId: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const teacher = await ctx.db.teacher.findUnique({
      where: { id: input.id },
      include: {
        lessons: {
          include: {
            subject: true,
            band: { select: { id: true, name: true } },
            homeGroups: { include: { homeGroup: { select: { id: true, name: true } } } },
            hostLesson: { select: { subject: { select: { name: true } } } },
          },
          orderBy: [{ subject: { name: "asc" } }],
        },
        unavailability: true,
        ruleOverrides: { include: { rule: true } },
      },
    });
    if (!teacher) throw new TRPCError({ code: "NOT_FOUND" });
    return teacher;
  }),

  create: adminProcedure.input(teacherInput).mutation(async ({ ctx, input }) => {
    try {
      return await ctx.db.teacher.create({ data: input });
    } catch (e) {
      rethrowAsConflict(e);
    }
  }),

  update: adminProcedure
    .input(teacherInput.partial().extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      try {
        return await ctx.db.teacher.update({ where: { id }, data });
      } catch (e) {
        rethrowAsConflict(e);
      }
    }),

  remove: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    // Lessons keep their teacherId → SetNull (they become vacancies); nothing blocks the delete.
    try {
      await ctx.db.teacher.delete({ where: { id: input.id } });
    } catch (e) {
      rethrowAsConflict(e);
    }
    return { ok: true };
  }),

  // Replace the whole unavailability set of one teacher.
  setUnavailability: adminProcedure
    .input(z.object({ teacherId: z.string(), slots: z.array(slot) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.$transaction([
        ctx.db.teacherUnavailability.deleteMany({ where: { teacherId: input.teacherId } }),
        ctx.db.teacherUnavailability.createMany({
          data: input.slots.map((s) => ({ ...s, teacherId: input.teacherId })),
          skipDuplicates: true,
        }),
      ]);
      return { count: input.slots.length };
    }),
});
