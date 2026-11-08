// Teacher load: obligation minus reductions is what the lessons must fill.

export interface TeacherLoadInput {
  obligation: number;
  reduction: number;
  assigned: number; // Σ periods of the teacher's lessons
}

export type LoadStatus = "ok" | "under" | "over";

export interface TeacherLoad extends TeacherLoadInput {
  target: number; // obligation - reduction
  diff: number; // assigned - target (negative = under)
  status: LoadStatus;
}

export function teacherLoad(input: TeacherLoadInput): TeacherLoad {
  const target = Math.max(0, input.obligation - input.reduction);
  const diff = input.assigned - target;
  const status: LoadStatus = diff === 0 ? "ok" : diff < 0 ? "under" : "over";
  return { ...input, target, diff, status };
}

export function sumPeriods(lessons: { periods: number }[]): number {
  return lessons.reduce((acc, l) => acc + l.periods, 0);
}

// Pools: every lesson of a pool must have the same number of periods.
export function poolPeriodMismatch(lessons: { periods: number }[]): boolean {
  return new Set(lessons.map((l) => l.periods)).size > 1;
}
