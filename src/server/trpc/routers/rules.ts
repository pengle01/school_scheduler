import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, adminProcedure } from "../init";
import { RULES } from "@/lib/rulesCatalog";
import { DEFAULT_DAYS_PERIODS, parseDaysPeriods } from "@/lib/calendar";
import type { Context } from "../context";
import type { Prisma } from "@/generated/prisma/client";

const ruleMode = z.enum(["HARD", "SOFT", "OFF"]);

// Rules missing from the database get their catalogue defaults; existing rows are untouched.
export async function ensureRulesSeeded(db: Context["db"]) {
  const existing = new Set((await db.rule.findMany({ select: { code: true } })).map((r) => r.code));
  const missing = RULES.filter((r) => !existing.has(r.code));
  if (missing.length) {
    await db.rule.createMany({
      data: missing.map((r) => ({ code: r.code, mode: r.mode, weight: r.weight, params: r.params as Prisma.InputJsonValue })),
    });
  }
}

export async function getDaysPeriods(db: Context["db"]): Promise<number[]> {
  const row = await db.setting.findUnique({ where: { key: "daysPeriods" } });
  return row ? parseDaysPeriods(row.value) : DEFAULT_DAYS_PERIODS;
}

export const rulesRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    await ensureRulesSeeded(ctx.db);
    const rules = await ctx.db.rule.findMany({
      include: { overrides: { include: { teacher: { select: { id: true, name: true } } } } },
    });
    // Catalogue order
    const order = new Map(RULES.map((r, i) => [r.code, i]));
    return rules.sort((a, b) => (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99));
  }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        mode: ruleMode.optional(),
        weight: z.number().int().min(0).max(1000).optional(),
        params: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id, params, ...data } = input;
      return ctx.db.rule.update({
        where: { id },
        data: { ...data, ...(params !== undefined ? { params: params as Prisma.InputJsonValue } : {}) },
      });
    }),

  // mode null removes the override.
  setOverride: adminProcedure
    .input(z.object({ ruleId: z.string(), teacherId: z.string(), mode: ruleMode.nullable(), weight: z.number().int().min(0).max(1000).default(1) }))
    .mutation(async ({ ctx, input }) => {
      const where = { ruleId_teacherId: { ruleId: input.ruleId, teacherId: input.teacherId } };
      if (input.mode === null) {
        await ctx.db.ruleOverride.deleteMany({ where: { ruleId: input.ruleId, teacherId: input.teacherId } });
        return { ok: true };
      }
      await ctx.db.ruleOverride.upsert({
        where,
        create: { ruleId: input.ruleId, teacherId: input.teacherId, mode: input.mode, weight: input.weight },
        update: { mode: input.mode, weight: input.weight },
      });
      return { ok: true };
    }),

  // ── Settings (the week shape and the school name live here too) ──
  settings: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.setting.findMany();
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      daysPeriods: parseDaysPeriods(map.daysPeriods),
      schoolName: typeof map.schoolName === "string" ? map.schoolName : "",
    };
  }),

  setSettings: adminProcedure
    .input(z.object({ daysPeriods: z.array(z.number().int().min(1).max(12)).length(5).optional(), schoolName: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (input.daysPeriods && parseDaysPeriods(input.daysPeriods) !== input.daysPeriods && !Array.isArray(input.daysPeriods)) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      const ops = [];
      if (input.daysPeriods)
        ops.push(ctx.db.setting.upsert({ where: { key: "daysPeriods" }, create: { key: "daysPeriods", value: input.daysPeriods }, update: { value: input.daysPeriods } }));
      if (input.schoolName !== undefined)
        ops.push(ctx.db.setting.upsert({ where: { key: "schoolName" }, create: { key: "schoolName", value: input.schoolName }, update: { value: input.schoolName } }));
      await ctx.db.$transaction(ops);
      return { ok: true };
    }),
});
