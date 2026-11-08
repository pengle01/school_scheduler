import { describe, it, expect } from "vitest";
import { teacherLoad, sumPeriods, poolPeriodMismatch } from "@/lib/load";

describe("teacherLoad", () => {
  it("compares assigned periods with obligation minus reduction", () => {
    expect(teacherLoad({ obligation: 24, reduction: 0, assigned: 24 })).toMatchObject({ target: 24, diff: 0, status: "ok" });
    expect(teacherLoad({ obligation: 22, reduction: 3, assigned: 19 })).toMatchObject({ target: 19, diff: 0, status: "ok" });
    expect(teacherLoad({ obligation: 24, reduction: 0, assigned: 20 })).toMatchObject({ diff: -4, status: "under" });
    expect(teacherLoad({ obligation: 18, reduction: 0, assigned: 21 })).toMatchObject({ diff: 3, status: "over" });
  });

  it("never has a negative target", () => {
    expect(teacherLoad({ obligation: 4, reduction: 10, assigned: 0 }).target).toBe(0);
  });
});

describe("sumPeriods", () => {
  it("adds up lesson periods, empty list is 0", () => {
    expect(sumPeriods([{ periods: 2 }, { periods: 5 }])).toBe(7);
    expect(sumPeriods([])).toBe(0);
  });
});

describe("poolPeriodMismatch", () => {
  it("flags pools whose lessons differ in periods", () => {
    expect(poolPeriodMismatch([{ periods: 2 }, { periods: 2 }])).toBe(false);
    expect(poolPeriodMismatch([{ periods: 2 }, { periods: 3 }])).toBe(true);
    expect(poolPeriodMismatch([])).toBe(false);
  });
});
