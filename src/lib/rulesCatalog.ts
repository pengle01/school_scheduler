// The rule catalogue (RULES.md) with the defaults the real 2026-27 timetable
// suggests: the shapes and the 2-consecutive limit are soft in practice, long
// workshops override the daily maximum. Names and descriptions are translated
// in messages/*.json under `rules.<code>`.

export type RuleModeValue = "HARD" | "SOFT" | "OFF";

export interface RuleSpec {
  code: string;
  mode: RuleModeValue;
  weight: number;
  params: Record<string, unknown>;
  // Rules that may be relaxed per teacher
  perTeacher: boolean;
}

export const RULES: RuleSpec[] = [
  { code: "L1", mode: "HARD", weight: 1, params: {}, perTeacher: false }, // block periods are consecutive
  { code: "L4", mode: "HARD", weight: 1, params: { pairs: [[1, 2], [2, 3], [3, 4], [4, 5]] }, perTeacher: false }, // cross-day blocks (last+first) allowed only between these days
  { code: "B1", mode: "SOFT", weight: 5, params: {}, perTeacher: false }, // follow the declared block shape
  { code: "B2", mode: "HARD", weight: 1, params: {}, perTeacher: false }, // blocks of one lesson on different days
  { code: "P1", mode: "HARD", weight: 1, params: {}, perTeacher: false }, // lessons of a pool run simultaneously
  { code: "S1", mode: "HARD", weight: 1, params: {}, perTeacher: false }, // a student has one lesson per period
  { code: "T1", mode: "HARD", weight: 1, params: {}, perTeacher: false }, // teacher unavailability
  { code: "T2", mode: "SOFT", weight: 3, params: { max: 2 }, perTeacher: true }, // max consecutive periods
  { code: "T3", mode: "HARD", weight: 1, params: { max: 4 }, perTeacher: true }, // max last periods per week
  { code: "T4", mode: "HARD", weight: 1, params: { day7: 5, day8: 6, longExempt: true }, perTeacher: true }, // daily maximum
  { code: "G1", mode: "SOFT", weight: 1, params: {}, perTeacher: true }, // minimise teacher gaps
  { code: "R1", mode: "HARD", weight: 1, params: {}, perTeacher: false }, // one lesson per room per period
  { code: "R2", mode: "HARD", weight: 1, params: {}, perTeacher: false }, // room of the required type
  { code: "R3", mode: "SOFT", weight: 1, params: {}, perTeacher: false }, // minimise room changes per teacher per day
  { code: "R4", mode: "SOFT", weight: 2, params: {}, perTeacher: true }, // minimise the number of different rooms a teacher uses in the week
  { code: "O1", mode: "HARD", weight: 10, params: {}, perTeacher: true }, // a lesson comes after the lessons entered on it (Lesson.after): its period k after period k of each
];

export const RULE_CODES = RULES.map((r) => r.code);

export function ruleSpec(code: string): RuleSpec | undefined {
  return RULES.find((r) => r.code === code);
}

// Mode/weight in force for a teacher: the override wins when present.
export function effectiveRule(
  rule: { mode: RuleModeValue; weight: number },
  override?: { mode: RuleModeValue; weight: number } | null,
): { mode: RuleModeValue; weight: number } {
  return override ? { mode: override.mode, weight: override.weight } : { mode: rule.mode, weight: rule.weight };
}
