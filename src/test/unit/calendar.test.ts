import { describe, it, expect } from "vitest";
import { periodExists, totalSlots, maxPeriods, parseDaysPeriods, nextSlotKind, DEFAULT_DAYS_PERIODS } from "@/lib/calendar";

describe("periodExists", () => {
  it("knows that Tue/Wed/Fri have no 8th period", () => {
    expect(periodExists(1, 8)).toBe(true);
    expect(periodExists(2, 8)).toBe(false);
    expect(periodExists(3, 8)).toBe(false);
    expect(periodExists(4, 8)).toBe(true);
    expect(periodExists(5, 8)).toBe(false);
    expect(periodExists(5, 7)).toBe(true);
  });

  it("rejects out-of-range days and periods", () => {
    expect(periodExists(0, 1)).toBe(false);
    expect(periodExists(6, 1)).toBe(false);
    expect(periodExists(1, 0)).toBe(false);
  });
});

describe("week totals", () => {
  it("has 37 slots and 8 periods at most", () => {
    expect(totalSlots()).toBe(37);
    expect(maxPeriods()).toBe(8);
  });
});

describe("parseDaysPeriods", () => {
  it("accepts a valid list and falls back otherwise", () => {
    expect(parseDaysPeriods([7, 7, 7, 7, 7])).toEqual([7, 7, 7, 7, 7]);
    expect(parseDaysPeriods([8, 7])).toEqual(DEFAULT_DAYS_PERIODS);
    expect(parseDaysPeriods("x")).toEqual(DEFAULT_DAYS_PERIODS);
    expect(parseDaysPeriods([8, 7, 7, 8, 0])).toEqual(DEFAULT_DAYS_PERIODS);
  });
});

describe("nextSlotKind", () => {
  it("cycles free → hard → soft → free", () => {
    expect(nextSlotKind("FREE")).toBe("HARD");
    expect(nextSlotKind("HARD")).toBe("SOFT");
    expect(nextSlotKind("SOFT")).toBe("FREE");
  });
});
