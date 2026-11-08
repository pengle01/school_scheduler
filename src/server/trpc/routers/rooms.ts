import { z } from "zod";
import { createTRPCRouter, publicProcedure, adminProcedure } from "../init";
import { rethrowAsConflict } from "../errors";

const input = z.object({
  name: z.string().trim().min(1),
  kind: z.string().trim().nullable().optional(),
  capacity: z.number().int().min(0).max(999).nullable().optional(),
  note: z.string().trim().nullable().optional(),
});

export const roomsRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    const rooms = await ctx.db.room.findMany({ include: { _count: { select: { lessons: true } } }, orderBy: { name: "asc" } });
    return rooms.map(({ _count, ...r }) => ({ ...r, lessons: _count.lessons }));
  }),

  create: adminProcedure.input(input).mutation(async ({ ctx, input }) => {
    try {
      return await ctx.db.room.create({ data: input });
    } catch (e) {
      rethrowAsConflict(e);
    }
  }),

  update: adminProcedure.input(input.partial().extend({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    try {
      return await ctx.db.room.update({ where: { id }, data });
    } catch (e) {
      rethrowAsConflict(e);
    }
  }),

  // Lessons lose the room from their lists (cascade on LessonRoom).
  remove: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    try {
      await ctx.db.room.delete({ where: { id: input.id } });
    } catch (e) {
      rethrowAsConflict(e);
    }
    return { ok: true };
  }),
});
