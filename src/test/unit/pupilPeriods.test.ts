import { describe, it, expect } from "vitest";
import { pupilLessonBreakdown, pupilPeriods, type LessonLoad } from "@/lib/pupilPeriods";

const lesson = (id: string, periods: number, over: Partial<LessonLoad> = {}): LessonLoad => ({
  id,
  periods,
  audience: "ALL",
  homeGroupIds: ["G1"],
  studentIds: [],
  hostLessonId: null,
  bandId: null,
  ...over,
});

const pupils = [
  { id: "a", homeGroupId: "G1" },
  { id: "b", homeGroupId: "G1" },
  { id: "c", homeGroupId: "G2" },
  { id: "d", homeGroupId: null },
];

describe("pupilPeriods", () => {
  it("sums the whole-group lessons of a pupil's home group, merged lessons included", () => {
    const r = pupilPeriods(pupils, [lesson("maths", 3), lesson("merged", 2, { homeGroupIds: ["G1", "G2"] })]);
    expect(r.get("a")).toBe(5);
    expect(r.get("c")).toBe(2);
  });

  it("adds subset lessons only for the pupils they name", () => {
    const r = pupilPeriods(pupils, [lesson("french", 2, { audience: "SUBSET", studentIds: ["a"] })]);
    expect(r.get("a")).toBe(2);
    expect(r.get("b")).toBe(0);
  });

  it("gives a pupil with no home group only their subset lessons", () => {
    const r = pupilPeriods(pupils, [lesson("maths", 3), lesson("x", 1, { audience: "SUBSET", studentIds: ["d"] })]);
    expect(r.get("d")).toBe(1);
  });

  it("counts support instead of the host for a pupil who leaves it", () => {
    const r = pupilPeriods(pupils, [
      lesson("french", 2),
      lesson("st", 2, { audience: "SUBSET", studentIds: ["a"], hostLessonId: "french" }),
    ]);
    expect(r.get("a")).toBe(2);
    expect(r.get("b")).toBe(2);
  });

  it("removes every option of the host's band for a pupil in support", () => {
    const r = pupilPeriods(pupils, [
      lesson("opt1", 2, { audience: "SUBSET", studentIds: ["a", "b"], bandId: "B" }),
      lesson("opt2", 2, { audience: "SUBSET", studentIds: ["a"], bandId: "B" }),
      lesson("st", 2, { audience: "SUBSET", studentIds: ["a"], hostLessonId: "opt1" }),
    ]);
    expect(r.get("a")).toBe(2);
    expect(r.get("b")).toBe(2);
  });

  it("does not count a pupil twice when two of a lesson's home groups overlap", () => {
    const r = pupilPeriods(pupils, [lesson("x", 3, { homeGroupIds: ["G1", "G1"] })]);
    expect(r.get("a")).toBe(3);
  });

  it("removes excused lessons, and the other options when the excused lesson is in a band", () => {
    const excused = [
      { id: "a", homeGroupId: "G1", excusedFrom: ["religion"] },
      { id: "b", homeGroupId: "G1", excusedFrom: ["opt1"] },
      { id: "c", homeGroupId: "G1" },
    ];
    const r = pupilPeriods(excused, [
      lesson("religion", 1),
      lesson("opt1", 2, { audience: "SUBSET", studentIds: ["b", "c"], bandId: "B" }),
      lesson("opt2", 2, { audience: "SUBSET", studentIds: ["b"], bandId: "B" }),
    ]);
    expect(r.get("a")).toBe(0);
    expect(r.get("b")).toBe(1);
    expect(r.get("c")).toBe(3);
  });
});

describe("pupilLessonBreakdown", () => {
  it("separates attended lessons from those left for ΣΤ or excused, and ignores other pupils' lessons", () => {
    const r = pupilLessonBreakdown({ id: "a", homeGroupId: "G1", excusedFrom: ["religion"] }, [
      lesson("maths", 3),
      lesson("religion", 1),
      lesson("french", 2, { audience: "SUBSET", studentIds: ["a", "b"] }),
      lesson("st", 1, { audience: "SUBSET", studentIds: ["a"], hostLessonId: "french" }),
      lesson("other", 2, { homeGroupIds: ["G2"] }),
      lesson("bOnly", 1, { audience: "SUBSET", studentIds: ["b"] }),
    ]);
    expect(r.attending.sort()).toEqual(["maths", "st"]);
    expect(r.left).toEqual([
      { id: "religion", reason: "excused" },
      { id: "french", reason: "support" },
    ]);
  });
});
