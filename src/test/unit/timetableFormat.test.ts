import { describe, it, expect } from "vitest";
import { TimetableFileSchema, keysByIdentity, identityKey, resolvePlacements, summaryOf, type LessonIdentity } from "@/lib/timetableFormat";
import { attendanceOf, type LessonLoad } from "@/lib/pupilPeriods";

const file = {
  format: "school-scheduler-timetable",
  version: 1,
  source: "data/orologio-26-27.json",
  createdAt: "2026-11-08T08:25:09.665419+00:00",
  status: "FEASIBLE",
  objective: 5965,
  bound: 434,
  penalties: { S1: 6, B1: 111 },
  contradictoryPupils: ["P1"],
  unresolvedPupils: [],
  rules: { S1: { mode: "HARD", weight: 1 } },
  seconds: 1203.1,
  placements: [
    { lesson: "L0001", day: 1, period: 6, room: "111" },
    { lesson: "L0001", day: 2, period: 1, room: null },
    { lesson: "L0002", day: 1, period: 6 },
    { lesson: "L0009", day: 3, period: 3 },
  ],
};

describe("TimetableFileSchema", () => {
  it("accepts the solver's file and rejects other formats", () => {
    expect(TimetableFileSchema.parse(file).penalties.S1).toBe(6);
    expect(TimetableFileSchema.safeParse({ ...file, format: "school-scheduler" }).success).toBe(false);
    expect(TimetableFileSchema.safeParse({ ...file, placements: [{ lesson: "L1", day: 9, period: 1 }] }).success).toBe(false);
  });
});

describe("resolvePlacements", () => {
  it("maps keys to lesson ids and reports unknown keys and short lessons", () => {
    const parsed = TimetableFileSchema.parse(file);
    const keyOf = new Map([
      ["L0001", "a"],
      ["L0002", "b"],
      ["L0003", "c"],
    ]);
    const periodsOf = new Map([
      ["a", 2],
      ["b", 2],
      ["c", 1],
    ]);
    const r = resolvePlacements(parsed, keyOf, periodsOf);
    expect(r.placements).toEqual([
      { lessonId: "a", day: 1, period: 6, room: "111" },
      { lessonId: "a", day: 2, period: 1, room: null },
      { lessonId: "b", day: 1, period: 6, room: null },
    ]);
    expect(r.unknownKeys).toEqual(["L0009"]);
    expect(r.problems).toEqual(["b: 1/2", "c: 0/1"]);
    expect(summaryOf(parsed, r.problems).contradictoryPupils).toEqual(["P1"]);
  });
});

describe("attendanceOf", () => {
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
  it("gives the lesson ids a pupil sits in, support winning over the host's band", () => {
    const pupils = [{ id: "a", homeGroupId: "G1" }, { id: "b", homeGroupId: "G1" }];
    const r = attendanceOf(pupils, [
      lesson("maths", 3),
      lesson("opt1", 2, { audience: "SUBSET", studentIds: ["a", "b"], bandId: "B" }),
      lesson("opt2", 2, { audience: "SUBSET", studentIds: ["a"], bandId: "B" }),
      lesson("st", 2, { audience: "SUBSET", studentIds: ["a"], hostLessonId: "opt1" }),
    ]);
    expect(r.get("a")).toEqual(new Set(["maths", "st"]));
    expect(r.get("b")).toEqual(new Set(["maths", "opt1"]));
  });
});

describe("keysByIdentity", () => {
  const id = (over: Partial<LessonIdentity> = {}): LessonIdentity => ({ subject: "Μαθηματικά", level: "A", homeGroups: ["ΗΥ1"], teacher: "Μ", periods: 3, audience: "ALL", students: null, band: null, excused: null, ...over });
  it("matches by content regardless of key order and pairs true duplicates", () => {
    const fileLessons = { L0002: id({ homeGroups: ["ΜΟ1", "ΗΥ1"] }), L0001: id(), L0003: id(), L0009: id({ teacher: "Ξ" }) };
    const db = [
      { id: "b", identity: id({ homeGroups: ["ΗΥ1", "ΜΟ1"] }) },
      { id: "a1", identity: id() },
      { id: "a2", identity: id() },
    ];
    const r = keysByIdentity(fileLessons, db);
    expect(r.keyOf.get("L0002")).toBe("b");
    expect(new Set([r.keyOf.get("L0001"), r.keyOf.get("L0003")])).toEqual(new Set(["a1", "a2"]));
    expect(r.unmatched).toEqual(["L0009"]);
  });
  it("matches a lesson whose teacher changed after the solve and reports it", () => {
    const r = keysByIdentity({ L1: id({ teacher: "Γ" }), L2: id({ subject: "Φυσική" }) }, [{ id: "x", identity: id({ teacher: "Ν" }) }]);
    expect(r.keyOf.get("L1")).toBe("x");
    expect(r.teacherChanged).toEqual([{ key: "L1", lessonId: "x", subject: "Μαθηματικά", homeGroups: ["ΗΥ1"], from: "Γ", to: "Ν" }]);
    expect(r.unmatched).toEqual(["L2"]);
  });
  it("tells two identical parts apart by the pupils excused from them", () => {
    const part1 = id({ excused: ["p9"] });
    const part2 = id({ excused: [] });
    const r = keysByIdentity({ A: part1, B: part2 }, [{ id: "x", identity: id({ excused: [] }) }, { id: "y", identity: id({ excused: ["p9"] }) }]);
    expect(r.keyOf.get("A")).toBe("y");
    expect(r.keyOf.get("B")).toBe("x");
  });
  it("tells SUBSET lessons apart by their pupils and ignores pupil order", () => {
    expect(identityKey(id({ audience: "SUBSET", students: ["2", "1"] }))).toBe(identityKey(id({ audience: "SUBSET", students: ["1", "2"] })));
    expect(identityKey(id({ audience: "SUBSET", students: ["1"] }))).not.toBe(identityKey(id({ audience: "SUBSET", students: ["1", "2"] })));
  });
});
