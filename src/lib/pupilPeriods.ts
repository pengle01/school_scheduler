// Weekly periods each pupil attends. Same rule as the solver (solver/data.py, compute_attendance):
// every ALL lesson of their home group plus every SUBSET lesson naming them, except a host lesson
// (or any option of the host's band) they leave for ΣΤ, and any lesson they are excused from.

export type PupilRef = { id: string; homeGroupId: string | null; excusedFrom?: string[] };

export type LessonLoad = {
  id: string;
  periods: number;
  audience: "ALL" | "SUBSET";
  homeGroupIds: string[];
  studentIds: string[];
  hostLessonId: string | null;
  bandId: string | null;
};

/** Lesson ids each pupil attends (support wins over the host and the host's band). */
export function attendanceOf(pupils: PupilRef[], lessons: LessonLoad[]): Map<string, Set<string>> {
  const byId = new Map(lessons.map((l) => [l.id, l]));

  const optionsOfBand = new Map<string, string[]>();
  for (const l of lessons) {
    if (l.bandId) optionsOfBand.set(l.bandId, [...(optionsOfBand.get(l.bandId) ?? []), l.id]);
  }

  const pulledFrom = new Map<string, Set<string>>(); // lesson id → pupils who leave it for support
  for (const l of lessons) {
    const host = l.hostLessonId ? byId.get(l.hostLessonId) : undefined;
    if (!host) continue;
    const targets = host.bandId ? [host.id, ...(optionsOfBand.get(host.bandId) ?? [])] : [host.id];
    for (const target of targets) {
      const pulled = pulledFrom.get(target) ?? new Set<string>();
      for (const s of l.studentIds) pulled.add(s);
      pulledFrom.set(target, pulled);
    }
  }

  for (const p of pupils) {
    for (const lessonId of p.excusedFrom ?? []) {
      const lesson = byId.get(lessonId);
      if (!lesson) continue;
      for (const target of lesson.bandId ? optionsOfBand.get(lesson.bandId) ?? [] : [lessonId]) {
        pulledFrom.set(target, (pulledFrom.get(target) ?? new Set<string>()).add(p.id));
      }
    }
  }

  const pupilsOfGroup = new Map<string, string[]>();
  for (const p of pupils) {
    if (p.homeGroupId) pupilsOfGroup.set(p.homeGroupId, [...(pupilsOfGroup.get(p.homeGroupId) ?? []), p.id]);
  }

  const attendance = new Map<string, Set<string>>(pupils.map((p) => [p.id, new Set<string>()]));
  for (const l of lessons) {
    const pulled = pulledFrom.get(l.id);
    const attending = new Set(l.audience === "SUBSET" ? l.studentIds : l.homeGroupIds.flatMap((g) => pupilsOfGroup.get(g) ?? []));
    for (const id of attending) {
      const set = attendance.get(id);
      if (set && !pulled?.has(id)) set.add(l.id);
    }
  }
  return attendance;
}

export function pupilPeriods(pupils: PupilRef[], lessons: LessonLoad[]): Map<string, number> {
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const attendance = attendanceOf(pupils, lessons);
  return new Map([...attendance].map(([id, keys]) => [id, [...keys].reduce((a, k) => a + (byId.get(k)?.periods ?? 0), 0)]));
}

export type LeftReason = "support" | "excused";

/** One pupil's lessons: those attended, and those listed for them that they leave, and why. */
export function pupilLessonBreakdown(pupil: PupilRef, lessons: LessonLoad[]): { attending: string[]; left: { id: string; reason: LeftReason }[] } {
  const attending = attendanceOf([pupil], lessons).get(pupil.id) ?? new Set<string>();
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const excused = new Set(pupil.excusedFrom ?? []);
  const excusedBands = new Set([...excused].map((id) => byId.get(id)?.bandId).filter((b): b is string => !!b));
  const left = lessons
    .filter((l) => !attending.has(l.id))
    .filter((l) => (l.audience === "SUBSET" ? l.studentIds.includes(pupil.id) : !!pupil.homeGroupId && l.homeGroupIds.includes(pupil.homeGroupId)))
    .map((l) => ({ id: l.id, reason: (excused.has(l.id) || (l.bandId && excusedBands.has(l.bandId)) ? "excused" : "support") as LeftReason }));
  return { attending: [...attending], left };
}
