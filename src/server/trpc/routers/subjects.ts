import { z } from "zod";
import { createTRPCRouter, publicProcedure, adminProcedure } from "../init";
import { rethrowAsConflict } from "../errors";

export const levelEnum = z.enum(["A", "B", "C", "NONE"]);

const subjectInput = z.object({
  name: z.string().trim().min(1),
  code: z.string().trim().nullable().optional(),
  level: levelEnum,
  periodsPerWeek: z.number().int().min(0).max(40).nullable().optional(),
  note: z.string().trim().nullable().optional(),
});

export const subjectsRouter = createTRPCRouter({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.subject.findMany({
      include: { _count: { select: { lessons: true } } },
      orderBy: [{ name: "asc" }, { level: "asc" }],
    }),
  ),

  create: adminProcedure.input(subjectInput).mutation(async ({ ctx, input }) => {
    try {
      return await ctx.db.subject.create({ data: input });
    } catch (e) {
      rethrowAsConflict(e);
    }
  }),

  update: adminProcedure.input(subjectInput.partial().extend({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    try {
      return await ctx.db.subject.update({ where: { id }, data });
    } catch (e) {
      rethrowAsConflict(e);
    }
  }),

  remove: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    try {
      await ctx.db.subject.delete({ where: { id: input.id } });
    } catch (e) {
      rethrowAsConflict(e);
    }
    return { ok: true };
  }),
});
