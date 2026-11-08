import { describe, it, expect } from "vitest";
import { toggleSlot, zoneGridIssues, zonePeriods, type Zone } from "@/lib/zoneGrid";

const zone = (name: string, fixedSlots: Zone["fixedSlots"], options: Partial<Zone["options"][number]>[]): Zone => ({
  id: name,
  name,
  fixedSlots,
  options: options.map((o, i) => ({ id: `${name}${i}`, periods: 2, teacherId: null, pupils: [], ...o })),
});

describe("toggleSlot", () => {
  it("adds, removes and groups by day", () => {
    let f = toggleSlot(null, 4, 1);
    f = toggleSlot(f, 4, 2);
    f = toggleSlot(f, 1, 8);
    expect(f).toEqual([{ day: 1, periods: [8] }, { day: 4, periods: [1, 2] }]);
    f = toggleSlot(f, 1, 8);
    f = toggleSlot(f, 4, 1);
    expect(f).toEqual([{ day: 4, periods: [2] }]);
    expect(toggleSlot(f, 4, 2)).toBeNull();
  });
});

describe("zoneGridIssues", () => {
  it("accepts a good grid and names the most common period count", () => {
    const z = zone("A", [{ day: 4, periods: [1, 2] }], [{ teacherId: "t1", pupils: ["p1"] }, { teacherId: "t2", pupils: ["p2"], periods: 1 }, { teacherId: "t3" }]);
    expect(zonePeriods(z)).toBe(2);
    expect(zoneGridIssues([z])).toEqual([]);
  });

  it("flags unplaced zones, wrong slot counts and slots outside the week", () => {
    expect(zoneGridIssues([zone("A", null, [{}])])).toEqual([{ kind: "unplaced", zone: "A" }]);
    expect(zoneGridIssues([zone("A", [{ day: 2, periods: [8] }], [{}])])).toEqual([
      { kind: "periods", zone: "A", slots: 1, periods: 2 },
      { kind: "outsideWeek", zone: "A", day: 2, period: 8 },
    ]);
  });

  it("finds a teacher or pupils in two zones at one slot, not in two options of one zone", () => {
    const a = zone("A", [{ day: 1, periods: [1, 2] }], [{ teacherId: "t1", pupils: ["p1", "p2"] }]);
    const b = zone("B", [{ day: 1, periods: [2, 3] }], [{ teacherId: "t1", pupils: ["p2", "p3"] }, { teacherId: "t1" }]);
    expect(zoneGridIssues([a, b])).toEqual([
      { kind: "teacher", teacherId: "t1", day: 1, period: 2, zones: ["A", "B"] },
      { kind: "pupil", pupils: 1, day: 1, period: 2, zones: ["A", "B"] },
    ]);
  });
});
