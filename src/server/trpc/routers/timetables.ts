import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, adminProcedure } from "../init";
import { ImportError } from "@/server/import";
import { importTimetable, parseTimetableFile } from "@/server/timetable";
import type { TimetableSummary } from "@/lib/timetableFormat";

export const timetablesRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.timetable.findMany({ include: { _count: { select: { placements: true } } }, orderBy: { createdAt: "desc" } });
    return rows.map(({ _count, summary, ...t }) => ({ ...t, summary: summary as unknown as TimetableSummary, placements: _count.placements }));
  }),

  placements: publicProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) =>
    ctx.db.placement.findMany({ where: { timetableId: input.id }, select: { lessonId: true, day: true, period: true, roomId: true } }),
  ),

  import: adminProcedure.input(z.object({ name: z.string().trim().min(1), text: z.string() })).mutation(async ({ ctx, input }) => {
    try {
      return await importTimetable(ctx.db, input.name, parseTimetableFile(input.text));
    } catch (e) {
      if (e instanceof ImportError) throw new TRPCError({ code: "BAD_REQUEST", message: e.key });
      throw e;
    }
  }),

  rename: adminProcedure.input(z.object({ id: z.string(), name: z.string().trim().min(1) })).mutation(({ ctx, input }) =>
    ctx.db.timetable.update({ where: { id: input.id }, data: { name: input.name } }),
  ),

  remove: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.timetable.delete({ where: { id: input.id } });
    return { ok: true };
  }),
});
