import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, adminProcedure } from "../init";
import { rethrowAsConflict } from "../errors";
import { normaliseShape, defaultShape } from "@/lib/shape";
import { FixedSlotSchema } from "@/lib/exportFormat";
import { lessonInclude } from "./homeGroups";
import { Prisma } from "@/generated/prisma/client";
import type { Context } from "../context";

const supportKindEnum = z.enum(["ST", "EXST", "AST"]);

const lessonInput = z.object({
  subjectId: z.string(),
  teacherId: z.string().nullable().optional(),
  homeGroupIds: z.array(z.string()).min(1),
  periods: z.number().int().min(1).max(40),
  shape: z.string().trim().optional(),
  audience: z.enum(["ALL", "SUBSET"]).optional(),
  studentIds: z.array(z.string()).optional(),
  hostLessonId: z.string().nullable().optional(),
  supportKind: supportKindEnum.nullable().optional(),
  bandId: z.string().nullable().optional(),
  long: z.boolean().optional(),
  fixedRoom: z.string().trim().nullable().optional(),
  roomMode: z.enum(["ANY", "PREFER", "ONLY"]).optional(),
  roomKind: z.string().trim().nullable().optional(),
  sameRoom: z.boolean().optional(),
  roomIds: z.array(z.string()).optional(),
  fixedSlots: z.array(FixedSlotSchema).nullable().optional(),
  note: z.string().trim().nullable().optional(),
});

function resolveShape(shape: string | undefined, periods: number): string {
  if (!shape) return defaultShape(periods);
  const normalised = normaliseShape(shape, periods);
  if (!normalised) throw new TRPCError({ code: "BAD_REQUEST", message: "badShape" });
  return normalised;
}

// The structural invariants, checked before any write.
async function validate(
  db: Context["db"],
  data: { id?: string; homeGroupIds: string[]; audience: "ALL" | "SUBSET"; studentIds: string[]; hostLessonId: string | null; supportKind: string | null; bandId: string | null; periods: number },
) {
  if (data.hostLessonId && data.bandId) throw new TRPCError({ code: "BAD_REQUEST", message: "duringAndBand" });
  if (data.supportKind === "ST" && !data.hostLessonId) throw new TRPCError({ code: "BAD_REQUEST", message: "supportNeedsHost" });
  if (data.supportKind && data.supportKind !== "ST" && data.hostLessonId) throw new TRPCError({ code: "BAD_REQUEST", message: "onlyStHasHost" });
  if (data.hostLessonId && !data.supportKind) throw new TRPCError({ code: "BAD_REQUEST", message: "supportNeedsHost" });
  if (data.hostLessonId === data.id && data.id) throw new TRPCError({ code: "BAD_REQUEST", message: "supportNeedsHost" });
  if (data.audience === "SUBSET" && data.studentIds.length) {
    const outside = await db.student.count({ where: { id: { in: data.studentIds }, NOT: { homeGroupId: { in: data.homeGroupIds } } } });
    if (outside) throw new TRPCError({ code: "BAD_REQUEST", message: "pupilsOutside" });
  }
  if (data.hostLessonId) {
    const host = await db.lesson.findUnique({ where: { id: data.hostLessonId }, include: { homeGroups: true, students: true } });
    if (!host) throw new TRPCError({ code: "NOT_FOUND" });
    if (host.hostLessonId) throw new TRPCError({ code: "BAD_REQUEST", message: "hostIsSupport" });
    if (data.periods > host.periods) throw new TRPCError({ code: "BAD_REQUEST", message: "supportTooLong" });
    const hostGroups = new Set(host.homeGroups.map((h) => h.homeGroupId));
    if (!data.homeGroupIds.every((g) => hostGroups.has(g))) throw new TRPCError({ code: "BAD_REQUEST", message: "supportGroups" });
    const hostPupils = new Set(host.students.map((s) => s.studentId));
    if (host.audience === "SUBSET" && data.studentIds.some((s) => hostPupils.has(s))) throw new TRPCError({ code: "BAD_REQUEST", message: "pupilInHost" });
  }
}

export const lessonsRouter = createTRPCRouter({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.lesson.findMany({
      include: lessonInclude,
      orderBy: [{ subject: { name: "asc" } }],
    }),
  ),

  // Everything the lesson editor's selects need, in one call.
  options: publicProcedure.query(async ({ ctx }) => {
    const [teachers, subjects, homeGroups, bands] = await Promise.all([
      ctx.db.teacher.findMany({ select: { id: true, name: true, active: true }, orderBy: { name: "asc" } }),
      ctx.db.subject.findMany({ select: { id: true, name: true, level: true }, orderBy: [{ name: "asc" }, { level: "asc" }] }),
      ctx.db.homeGroup.findMany({ select: { id: true, name: true, year: true }, orderBy: { name: "asc" } }),
      ctx.db.band.findMany({ select: { id: true, name: true, kind: true }, orderBy: { name: "asc" } }),
    ]);
    return { teachers, subjects, homeGroups, bands };
  }),

  // Lessons that can host a support lesson for the given home groups (not support themselves).
  hostCandidates: publicProcedure.input(z.object({ homeGroupIds: z.array(z.string()).min(1) })).query(({ ctx, input }) =>
    ctx.db.lesson.findMany({
      where: { hostLessonId: null, homeGroups: { some: { homeGroupId: { in: input.homeGroupIds } } } },
      include: lessonInclude,
      orderBy: [{ subject: { name: "asc" } }],
    }),
  ),

  // Same room for every period, for a whole category at once (the filtered lessons of the table).
  setSameRoom: adminProcedure.input(z.object({ ids: z.array(z.string()).min(1), value: z.boolean() })).mutation(async ({ ctx, input }) => {
    const r = await ctx.db.lesson.updateMany({ where: { id: { in: input.ids } }, data: { sameRoom: input.value } });
    return { count: r.count };
  }),

  roomOptions: publicProcedure.query(async ({ ctx }) => {
    const rooms = await ctx.db.room.findMany({ select: { id: true, name: true, kind: true, capacity: true }, orderBy: { name: "asc" } });
    const kinds = [...new Set(rooms.map((r) => r.kind).filter((k): k is string => !!k))].sort();
    return { rooms, kinds };
  }),

  create: adminProcedure.input(lessonInput).mutation(async ({ ctx, input }) => {
    const audience = input.audience ?? (input.studentIds?.length ? "SUBSET" : "ALL");
    const studentIds = audience === "SUBSET" ? input.studentIds ?? [] : [];
    if (input.roomMode === "ONLY" && !(input.roomIds?.length)) throw new TRPCError({ code: "BAD_REQUEST", message: "roomsRequired" });
    await validate(ctx.db, { ...input, audience, studentIds, hostLessonId: input.hostLessonId ?? null, supportKind: input.supportKind ?? null, bandId: input.bandId ?? null });
    try {
      return await ctx.db.lesson.create({
        data: {
          subjectId: input.subjectId,
          teacherId: input.teacherId ?? null,
          periods: input.periods,
          shape: resolveShape(input.shape, input.periods),
          audience,
          hostLessonId: input.hostLessonId ?? null,
          supportKind: input.supportKind ?? null,
          bandId: input.bandId ?? null,
          long: input.long ?? false,
          fixedRoom: input.fixedRoom ?? null,
          roomMode: input.roomMode ?? "ANY",
          roomKind: input.roomKind ?? null,
          sameRoom: input.sameRoom ?? false,
          fixedSlots: input.fixedSlots ? (input.fixedSlots as unknown as Prisma.InputJsonValue) : undefined,
          note: input.note ?? null,
          homeGroups: { create: input.homeGroupIds.map((homeGroupId) => ({ homeGroupId })) },
          students: { create: studentIds.map((studentId) => ({ studentId })) },
          rooms: { create: (input.roomIds ?? []).map((roomId, rank) => ({ roomId, rank })) },
        },
        include: lessonInclude,
      });
    } catch (e) {
      rethrowAsConflict(e);
    }
  }),

  update: adminProcedure.input(lessonInput.partial().extend({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { id, homeGroupIds, studentIds, shape, fixedSlots, roomIds, ...data } = input;
    if (data.roomMode === "ONLY" && roomIds !== undefined && roomIds.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "roomsRequired" });
    const current = await ctx.db.lesson.findUnique({ where: { id }, include: { homeGroups: true, students: true } });
    if (!current) throw new TRPCError({ code: "NOT_FOUND" });
    const periods = data.periods ?? current.periods;
    const nextShape = shape !== undefined ? resolveShape(shape, periods) : (normaliseShape(current.shape, periods) ?? defaultShape(periods));
    const audience = data.audience ?? current.audience;
    const nextStudents = audience === "ALL" ? [] : (studentIds ?? current.students.map((s) => s.studentId));
    const nextGroups = homeGroupIds ?? current.homeGroups.map((h) => h.homeGroupId);
    await validate(ctx.db, {
      id,
      homeGroupIds: nextGroups,
      audience,
      studentIds: nextStudents,
      hostLessonId: data.hostLessonId === undefined ? current.hostLessonId : data.hostLessonId,
      supportKind: data.supportKind === undefined ? current.supportKind : data.supportKind,
      bandId: data.bandId === undefined ? current.bandId : data.bandId,
      periods,
    });
    try {
      return await ctx.db.lesson.update({
        where: { id },
        data: {
          ...data,
          audience,
          shape: nextShape,
          ...(fixedSlots !== undefined ? { fixedSlots: fixedSlots === null ? Prisma.DbNull : (fixedSlots as unknown as Prisma.InputJsonValue) } : {}),
          ...(homeGroupIds ? { homeGroups: { deleteMany: {}, create: nextGroups.map((homeGroupId) => ({ homeGroupId })) } } : {}),
          ...(studentIds !== undefined || data.audience !== undefined ? { students: { deleteMany: {}, create: nextStudents.map((studentId) => ({ studentId })) } } : {}),
          ...(roomIds !== undefined ? { rooms: { deleteMany: {}, create: roomIds.map((roomId, rank) => ({ roomId, rank })) } } : {}),
        },
        include: lessonInclude,
      });
    } catch (e) {
      rethrowAsConflict(e);
    }
  }),

  // Deleting a host takes its support lessons with it (cascade) — the UI asks first.
  remove: adminProcedure.input(z.object({ id: z.string(), force: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
    const supports = await ctx.db.lesson.count({ where: { hostLessonId: input.id } });
    if (supports && !input.force) throw new TRPCError({ code: "CONFLICT", message: "hasSupport" });
    try {
      await ctx.db.lesson.delete({ where: { id: input.id } });
    } catch (e) {
      rethrowAsConflict(e);
    }
    return { ok: true, supportsRemoved: supports };
  }),
});
