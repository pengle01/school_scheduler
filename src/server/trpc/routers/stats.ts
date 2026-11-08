import { createTRPCRouter, publicProcedure } from "../init";
import { teacherLoad } from "@/lib/load";
import { shapeMatchesPeriods } from "@/lib/shape";
import { bandCheck, coverageDuring, pupilsOutsideHomeGroups, type LessonLike } from "@/lib/structure";

export const statsRouter = createTRPCRouter({
  dashboard: publicProcedure.query(async ({ ctx }) => {
    const [teachers, homeGroups, bands, lessons, studentsWithoutGroup, studentCount] = await Promise.all([
      ctx.db.teacher.findMany({ include: { lessons: { select: { periods: true } } }, orderBy: { name: "asc" } }),
      ctx.db.homeGroup.findMany({
        include: {
          students: { select: { id: true } },
          lessons: { include: { lesson: { select: { periods: true, supportKind: true } } } },
        },
        orderBy: [{ year: "asc" }, { name: "asc" }],
      }),
      ctx.db.band.findMany({ orderBy: { name: "asc" } }),
      ctx.db.lesson.findMany({
        include: {
          subject: { select: { name: true } },
          teacher: { select: { name: true } },
          homeGroups: { include: { homeGroup: { select: { name: true } } } },
          students: { select: { studentId: true } },
          excusals: { select: { studentId: true } },
        },
      }),
      ctx.db.student.count({ where: { homeGroupId: null } }),
      ctx.db.student.count(),
    ]);

    const pupils = new Map(homeGroups.map((g) => [g.name, new Set(g.students.map((s) => s.id))]));
    const like = (l: (typeof lessons)[number]): LessonLike => ({
      key: l.id,
      homeGroups: l.homeGroups.map((h) => h.homeGroup.name),
      audience: l.audience,
      students: l.students.map((s) => s.studentId),
      during: l.hostLessonId,
      periods: l.periods,
      band: l.bandId,
    });
    const label = (l: (typeof lessons)[number]) => `${l.homeGroups.map((h) => h.homeGroup.name).join("+")} — ${l.subject.name}`;

    const teacherRows = teachers.map((t) => ({
      id: t.id,
      name: t.name,
      department: t.department,
      active: t.active,
      ...teacherLoad({ obligation: t.obligation, reduction: t.reduction, assigned: t.lessons.reduce((a, l) => a + l.periods, 0) }),
    }));

    const groupRows = homeGroups.map((g) => ({
      id: g.id,
      name: g.name,
      year: g.year,
      direction: g.direction,
      students: g.students.length,
      periods: g.lessons.filter((l) => !l.lesson.supportKind).reduce((a, l) => a + l.lesson.periods, 0),
    }));

    const vacancies = lessons.filter((l) => !l.teacherId).map((l) => ({ id: l.id, label: label(l), periods: l.periods }));
    const badShapes = lessons.filter((l) => !shapeMatchesPeriods(l.shape, l.periods)).map((l) => ({ id: l.id, label: label(l), shape: l.shape, periods: l.periods }));
    const emptyHomeGroups = homeGroups.filter((g) => g.lessons.length === 0).map((g) => ({ id: g.id, name: g.name }));

    // Coverage during host lessons (French etc.)
    const supportsOf = new Map<string, (typeof lessons)[number][]>();
    for (const l of lessons) if (l.hostLessonId) supportsOf.set(l.hostLessonId, [...(supportsOf.get(l.hostLessonId) ?? []), l]);
    const coverage = [...supportsOf.entries()]
      .map(([hostId, sup]) => {
        const host = lessons.find((l) => l.id === hostId)!;
        const siblings = host.bandId ? lessons.filter((l) => l.bandId === host.bandId && l.id !== host.id) : [];
        const excused = new Set([host, ...siblings].flatMap((x) => x.excusals.map((e) => e.studentId)));
        const uncovered = coverageDuring(like(host), sup.map(like), pupils, siblings.map(like), excused);
        return { id: hostId, label: label(host), homeGroupId: host.homeGroups[0]?.homeGroupId, uncovered: uncovered.length };
      })
      .filter((c) => c.uncovered > 0);

    const pupilsOutside = lessons
      .map((l) => ({ id: l.id, label: label(l), n: pupilsOutsideHomeGroups(like(l), pupils).length }))
      .filter((x) => x.n > 0);

    const bandRows = bands.map((b) => {
      const options = lessons.filter((l) => l.bandId === b.id);
      const check = bandCheck(options.map(like), pupils);
      return { id: b.id, name: b.name, options: options.length, periodMismatch: check.periodMismatch, inTwoOptions: check.inTwoOptions.length, inNoOption: check.inNoOption.length };
    });
    const bandProblems = bandRows.filter((b) => b.periodMismatch || b.inTwoOptions > 0);

    return {
      totals: {
        teachers: teachers.length,
        activeTeachers: teachers.filter((t) => t.active).length,
        homeGroups: homeGroups.length,
        students: studentCount,
        bands: bands.length,
        lessons: lessons.length,
        periods: lessons.reduce((a, l) => a + l.periods, 0),
      },
      teachers: teacherRows,
      homeGroups: groupRows,
      warnings: { vacancies, badShapes, emptyHomeGroups, studentsWithoutGroup, coverage, pupilsOutside, bandProblems },
    };
  }),
});
