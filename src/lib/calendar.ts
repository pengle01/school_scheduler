// The school week: Mon 8, Tue 7, Wed 7, Thu 8, Fri 7 periods by default.
// Stored in Setting "daysPeriods" so a school with another week can change it.

export const DEFAULT_DAYS_PERIODS = [8, 7, 7, 8, 7];
export const DAY_COUNT = 5;

export function maxPeriods(daysPeriods: number[] = DEFAULT_DAYS_PERIODS): number {
  return Math.max(...daysPeriods);
}

// day is 1-based (1 = Monday), period is 1-based.
export function periodExists(
  day: number,
  period: number,
  daysPeriods: number[] = DEFAULT_DAYS_PERIODS,
): boolean {
  if (day < 1 || day > daysPeriods.length) return false;
  return period >= 1 && period <= daysPeriods[day - 1];
}

export function totalSlots(daysPeriods: number[] = DEFAULT_DAYS_PERIODS): number {
  return daysPeriods.reduce((a, b) => a + b, 0);
}

export function parseDaysPeriods(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== DAY_COUNT) return DEFAULT_DAYS_PERIODS;
  const nums = value.map((v) => Number(v));
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 12)) return DEFAULT_DAYS_PERIODS;
  return nums;
}

export type SlotKind = "FREE" | "HARD" | "SOFT";

// Click cycle used by the availability grid.
export function nextSlotKind(current: SlotKind): SlotKind {
  if (current === "FREE") return "HARD";
  if (current === "HARD") return "SOFT";
  return "FREE";
}
