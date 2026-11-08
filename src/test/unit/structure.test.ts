import { describe, it, expect } from "vitest";
import { upgradeV1, coverageDuring, bandCheck, pupilsOutsideHomeGroups, supportKindOf, bandKindOf, type LessonLike } from "@/lib/structure";
import type { ExportV1File } from "@/lib/exportFormat";

// A miniature 2026-27: home group ΗΥ1 (pupils 1-5) and ΕΓ1 (6-8), with
//  - French in two Orologio halves (same pupils 1,2) hosting ΣΤ (3) and ΑΣΤ (4) support,
//  - a pull-out during Religion (Orologio's ΘΡΗ_ΗΥ1 container holding pupils 1-4, ΑΣΤ pupil 5),
//  - a band ΑΠ1ΕΠΙΛ with two elective sections,
//  - a merged Physics lesson ΗΥ1_ΕΓ1, and a plain Maths lesson.
const v1: ExportV1File = {
  format: "school-scheduler",
  version: 1,
  exportedAt: "2026-11-01T00:00:00.000Z",
  settings: {},
  teachers: [],
  subjects: [],
  rules: [],
  groups: [
    { name: "ΗΥ1", kind: "HOME", year: "A", direction: "PRACTICE", parents: [], note: null },
    { name: "ΕΓ1", kind: "HOME", year: "A", direction: "PRACTICE", parents: [], note: null },
    { name: "ΓΑΛ_ΗΥ1_1", kind: "ELECTIVE", year: "A", direction: "NONE", parents: ["ΗΥ1"], note: null },
    { name: "ΓΑΛ_ΗΥ1_2", kind: "ELECTIVE", year: "A", direction: "NONE", parents: ["ΗΥ1"], note: null },
    { name: "ΣΤ_ΗΥ1_ΕΛΛ1", kind: "SUPPORT", year: "A", direction: "NONE", parents: ["ΗΥ1"], note: null },
    { name: "ΑΣΤ_ΗΥ1_ΧΧ_ΜΑΘ", kind: "PULLOUT", year: "A", direction: "NONE", parents: ["ΗΥ1"], note: null },
    { name: "ΘΡΗ_ΗΥ1", kind: "ELECTIVE", year: "A", direction: "NONE", parents: ["ΗΥ1"], note: null },
    { name: "ΑΣΤ_ΗΥ1_ΨΨ_ΦΥΣ", kind: "PULLOUT", year: "A", direction: "NONE", parents: ["ΗΥ1"], note: null },
    { name: "ΑΠ1CAD2", kind: "ELECTIVE", year: "A", direction: "NONE", parents: ["ΗΥ1", "ΕΓ1"], note: null },
    { name: "ΑΠ1CNC2", kind: "ELECTIVE", year: "A", direction: "NONE", parents: ["ΗΥ1", "ΕΓ1"], note: null },
    { name: "ΗΥ1_ΕΓ1", kind: "MERGED", year: "A", direction: "PRACTICE", parents: ["ΗΥ1", "ΕΓ1"], note: null },
  ],
  students: [
    ...[1, 2, 3, 4, 5].map((n) => ({ name: `Μ${n}`, externalId: String(n), homeGroup: "ΗΥ1", gender: "NONE" as const, groups: ["ΗΥ1"] })),
    ...[6, 7, 8].map((n) => ({ name: `Μ${n}`, externalId: String(n), homeGroup: "ΕΓ1", gender: "NONE" as const, groups: ["ΕΓ1"] })),
  ],
  pools: [],
  rooms: [],
  lessons: [
    { subject: "Μαθηματικά (ΑΠ)", level: "A", group: "ΗΥ1", teacher: "Μ", periods: 3, shape: "1+1+1", pool: null, long: false, fixedRoom: null, roomMode: "ANY", roomKind: null, sameRoom: false, rooms: [], fixedSlots: null, note: null },
    { subject: "Γαλλικά (ΑΠ)", level: "A", group: "ΓΑΛ_ΗΥ1_1", teacher: "Γ", periods: 1, shape: "1", pool: "ΓΑΛ_ΗΥ1_1", long: false, fixedRoom: null, roomMode: "ANY", roomKind: null, sameRoom: false, rooms: [], fixedSlots: null, note: null },
    { subject: "Γαλλικά (ΑΠ)", level: "A", group: "ΓΑΛ_ΗΥ1_2", teacher: "Γ", periods: 1, shape: "1", pool: "ΓΑΛ_ΗΥ1_2", long: false, fixedRoom: null, roomMode: "ANY", roomKind: null, sameRoom: false, rooms: [], fixedSlots: null, note: null },
    { subject: "Νέα Ελληνικά (ΑΠ)", level: "A", group: "ΣΤ_ΗΥ1_ΕΛΛ1", teacher: "Ε", periods: 1, shape: "1", pool: "ΓΑΛ_ΗΥ1_1", long: false, fixedRoom: null, roomMode: "ANY", roomKind: null, sameRoom: false, rooms: [], fixedSlots: null, note: null },
    { subject: "Μαθηματικά (ΑΠ)", level: "A", group: "ΑΣΤ_ΗΥ1_ΧΧ_ΜΑΘ", teacher: "Μ", periods: 1, shape: "1", pool: "ΓΑΛ_ΗΥ1_2", long: false, fixedRoom: null, roomMode: "ANY", roomKind: null, sameRoom: false, rooms: [], fixedSlots: null, note: null },
    { subject: "Θρησκευτικά (ΑΠ)", level: "A", group: "ΘΡΗ_ΗΥ1", teacher: "Θ", periods: 1, shape: "1", pool: "ΘΡΗ_ΗΥ1", long: false, fixedRoom: null, roomMode: "ANY", roomKind: null, sameRoom: false, rooms: [], fixedSlots: null, note: null },
    { subject: "Φυσική (ΑΠ)", level: "A", group: "ΑΣΤ_ΗΥ1_ΨΨ_ΦΥΣ", teacher: "Φ", periods: 1, shape: "1", pool: "ΘΡΗ_ΗΥ1", long: false, fixedRoom: null, roomMode: "ANY", roomKind: null, sameRoom: false, rooms: [], fixedSlots: null, note: null },
    { subject: "CAD (ΑΠ)", level: "A", group: "ΑΠ1CAD2", teacher: "Τ", periods: 2, shape: "2", pool: "ΑΠ1ΕΠΙΛ", long: false, fixedRoom: null, roomMode: "ANY", roomKind: null, sameRoom: false, rooms: [], fixedSlots: null, note: null },
    { subject: "CNC (ΑΠ)", level: "A", group: "ΑΠ1CNC2", teacher: "Τ2", periods: 2, shape: "2", pool: "ΑΠ1ΕΠΙΛ", long: false, fixedRoom: null, roomMode: "ANY", roomKind: null, sameRoom: false, rooms: [], fixedSlots: null, note: null },
    { subject: "Φυσική (ΑΠ)", level: "A", group: "ΗΥ1_ΕΓ1", teacher: "Φ", periods: 2, shape: "2", pool: null, long: false, fixedRoom: null, roomMode: "ANY", roomKind: null, sameRoom: false, rooms: [], fixedSlots: null, note: null },
    { subject: "Εργ.Μαγειρικής (ΑΠ)", level: "A", group: "ΕΓ1", teacher: "Ξ", periods: 7, shape: "1+1+1+1+1+1+1", pool: null, long: true, fixedRoom: null, roomMode: "ANY", roomKind: null, sameRoom: false, rooms: [], fixedSlots: [{ day: 1, periods: [1, 2, 3, 4, 5, 6, 7] }], note: null },
  ],
};
// memberships
const member = (group: string, ...ids: number[]) => {
  for (const s of v1.students) if (ids.includes(Number(s.externalId))) s.groups.push(group);
};
member("ΓΑΛ_ΗΥ1_1", 1, 2);
member("ΓΑΛ_ΗΥ1_2", 1, 2);
member("ΣΤ_ΗΥ1_ΕΛΛ1", 3);
member("ΑΣΤ_ΗΥ1_ΧΧ_ΜΑΘ", 4);
member("ΘΡΗ_ΗΥ1", 1, 2, 3, 4);
member("ΑΣΤ_ΗΥ1_ΨΨ_ΦΥΣ", 5);
member("ΑΠ1CAD2", 1, 2, 6);
member("ΑΠ1CNC2", 3, 4, 7);

const { file, report } = upgradeV1(v1);
const byNote = (note: string) => file.lessons.find((l) => l.note === note)!;

describe("upgradeV1 — structures", () => {
  it("keeps home groups and pupils with their home group only", () => {
    expect(file.homeGroups.map((g) => g.name)).toEqual(["ΗΥ1", "ΕΓ1"]);
    expect(file.students).toHaveLength(8);
    expect(file.students[0]).toEqual({ name: "Μ1", externalId: "1", homeGroup: "ΗΥ1", gender: "NONE", excusedFrom: [] });
  });

  it("joins the two French halves into one 2-period lesson hosting the support lessons", () => {
    const fr = byNote("ΓΑΛ_ΗΥ1");
    expect(fr).toMatchObject({ subject: "Γαλλικά (ΑΠ)", homeGroups: ["ΗΥ1"], periods: 2, shape: "1+1", audience: "SUBSET", students: ["1", "2"], during: null });
    const st = byNote("ΣΤ_ΗΥ1_ΕΛΛ1");
    expect(st).toMatchObject({ homeGroups: ["ΗΥ1"], audience: "SUBSET", students: ["3"], during: fr.key, supportKind: "ST", periods: 1 });
    expect(byNote("ΑΣΤ_ΗΥ1_ΧΧ_ΜΑΘ")).toMatchObject({ students: ["4"], during: fr.key, supportKind: "AST" });
  });

  it("makes a pull-out container the home group's own lesson with the pull-out during it", () => {
    const rel = byNote("ΘΡΗ_ΗΥ1");
    expect(rel).toMatchObject({ subject: "Θρησκευτικά (ΑΠ)", homeGroups: ["ΗΥ1"], audience: "ALL", students: null });
    expect(byNote("ΑΣΤ_ΗΥ1_ΨΨ_ΦΥΣ")).toMatchObject({ during: rel.key, supportKind: "AST", students: ["5"] });
  });

  it("turns an elective pool into a band whose options name their pupils", () => {
    expect(file.bands).toEqual([{ name: "ΑΠ1ΕΠΙΛ", kind: "ELECTIVE", note: null, fixedSlots: null }]);
    expect(byNote("ΑΠ1CAD2")).toMatchObject({ homeGroups: ["ΗΥ1", "ΕΓ1"], band: "ΑΠ1ΕΠΙΛ", audience: "SUBSET", students: ["1", "2", "6"] });
  });

  it("keeps merges, plain lessons and fixed workshops", () => {
    const physics = file.lessons.find((l) => l.subject === "Φυσική (ΑΠ)" && !l.supportKind)!;
    expect(physics).toMatchObject({ homeGroups: ["ΗΥ1", "ΕΓ1"], audience: "ALL" });
    const maths = file.lessons.find((l) => l.subject === "Μαθηματικά (ΑΠ)" && !l.supportKind)!;
    expect(maths).toMatchObject({ homeGroups: ["ΗΥ1"], audience: "ALL", band: null, during: null });
    expect(file.lessons.find((l) => l.long)!.fixedSlots).toEqual([{ day: 1, periods: [1, 2, 3, 4, 5, 6, 7] }]);
  });

  it("reports the counts and gives every lesson a unique key", () => {
    expect(report).toMatchObject({ homeGroups: 2, plain: 2, merges: 1, frenchBlocks: 1, supportLessons: 3, bands: 1, parallelBands: 0, hostsWithPullouts: 1, fixedWorkshops: 1 });
    expect(new Set(file.lessons.map((l) => l.key)).size).toBe(file.lessons.length);
    expect(report.notes).toEqual([]);
  });
});

describe("checks", () => {
  const pupils = new Map([["ΗΥ1", new Set(["1", "2", "3", "4", "5"])]]);
  const host: LessonLike = { key: "H", homeGroups: ["ΗΥ1"], audience: "SUBSET", students: ["1", "2"], during: null, periods: 2, band: null };
  const sup: LessonLike = { key: "S", homeGroups: ["ΗΥ1"], audience: "SUBSET", students: ["3"], during: "H", periods: 1, band: null };

  it("coverageDuring lists the pupils with nothing during the host", () => {
    // pupil 3 has one support period for a two-period host → still short
    expect(coverageDuring(host, [sup], pupils)).toEqual(["3", "4", "5"]);
    expect(coverageDuring(host, [sup, { ...sup, key: "S2" }], pupils)).toEqual(["4", "5"]);
    const sibling: LessonLike = { ...host, key: "H2", students: ["4"] };
    expect(coverageDuring(host, [sup, { ...sup, key: "S2" }], pupils, [sibling])).toEqual(["5"]);
    expect(coverageDuring({ ...host, audience: "ALL", students: null }, [], pupils)).toEqual([]);
    expect(coverageDuring(host, [sup, { ...sup, key: "S2" }], pupils, [], new Set(["4"]))).toEqual(["5"]); // excused pupils are accounted for
  });

  it("bandCheck flags period mismatch, pupils in two options and in none", () => {
    const a: LessonLike = { key: "A", homeGroups: ["ΗΥ1"], audience: "SUBSET", students: ["1", "2"], during: null, periods: 2, band: "B" };
    const b: LessonLike = { key: "B", homeGroups: ["ΗΥ1"], audience: "SUBSET", students: ["2", "3"], during: null, periods: 3, band: "B" };
    expect(bandCheck([a, b], pupils)).toEqual({ periodMismatch: true, inTwoOptions: ["2"], inNoOption: ["4", "5"] });
  });

  it("pupilsOutsideHomeGroups finds pupils named outside the lesson's groups", () => {
    expect(pupilsOutsideHomeGroups({ ...sup, students: ["3", "9"] }, pupils)).toEqual(["9"]);
    expect(pupilsOutsideHomeGroups({ ...host, audience: "ALL" }, pupils)).toEqual([]);
  });

  it("classifies by name", () => {
    expect(supportKindOf("ΕΞΣΤ_ΗΥ1_ΦΥΣ")).toBe("EXST");
    expect(supportKindOf("ΣΤ_ΗΥ1_ΕΛΛ1")).toBe("ST");
    expect(supportKindOf("ΑΣΤ_ΗΥ1_ΧΧ_ΜΑΘ")).toBe("AST");
    expect(supportKindOf("ΗΥ1")).toBeNull();
    expect(bandKindOf("ΒΠ2ΕΠΙΛ")).toBe("ELECTIVE");
    expect(bandKindOf("ΒΠΑΓΓΛ")).toBe("LEVEL");
    expect(bandKindOf("ΒΠΜΑΘ")).toBe("LEVEL");
  });
});

describe("upgradeV1 — individual support beside the class lesson", () => {
  const mk = (): ExportV1File => ({
    ...v1,
    groups: [
      { name: "ΘΗΨ3β", kind: "HOME", year: "C", direction: "THEORY", parents: [], note: null },
      { name: "ΦΥΣ_ΘΗΨ3β", kind: "MERGED", year: "C", direction: "NONE", parents: ["ΘΗΨ3β"], note: null }, // what groupKind gives these names
      { name: "ΑΤ_ΙΑ_ΘΗΨ3β_ΦΥΣ", kind: "MERGED", year: "C", direction: "NONE", parents: ["ΘΗΨ3β"], note: null },
      { name: "ΓΑΛ_ΘΗΨ3β_1", kind: "ELECTIVE", year: "C", direction: "NONE", parents: ["ΘΗΨ3β"], note: null },
      { name: "ΣΤ_ΘΗΨ3β_ΦΥΣ", kind: "SUPPORT", year: "C", direction: "NONE", parents: ["ΘΗΨ3β"], note: null },
    ],
    students: [1, 2, 3].map((n) => ({ name: `Π${n}`, externalId: `p${n}`, homeGroup: "ΘΗΨ3β", gender: "NONE" as const, groups: ["ΘΗΨ3β", ...(n < 3 ? ["ΦΥΣ_ΘΗΨ3β", "ΓΑΛ_ΘΗΨ3β_1"] : ["ΑΤ_ΙΑ_ΘΗΨ3β_ΦΥΣ"]), "ΣΤ_ΘΗΨ3β_ΦΥΣ"] })),
    lessons: [
      { ...v1.lessons[0], subject: "Φυσική (ΓΘ)", group: "ΦΥΣ_ΘΗΨ3β", teacher: "Φ1", periods: 4, shape: "1+1+1+1", pool: "ΦΥΣ_ΘΗΨ3β_1" },
      { ...v1.lessons[0], subject: "Φυσική (ΓΘ)", group: "ΑΤ_ΙΑ_ΘΗΨ3β_ΦΥΣ", teacher: "Φ2", periods: 4, shape: "2+1+1", pool: "ΦΥΣ_ΘΗΨ3β_1" },
      { ...v1.lessons[0], subject: "Γαλλικά (ΓΘ)", group: "ΓΑΛ_ΘΗΨ3β_1", teacher: "Γ", periods: 1, shape: "1", pool: "ΓΑΛ_ΘΗΨ3β_1" },
      { ...v1.lessons[0], subject: "Χημεία (ΓΘ)", group: "ΣΤ_ΘΗΨ3β_ΦΥΣ", teacher: "Χ", periods: 1, shape: "1", pool: "ΓΑΛ_ΘΗΨ3β_1" },
    ],
  });
  const { file: f, report: r } = upgradeV1(mk());

  it("makes the single-pupil option ΑΣΤ, excused from the class lesson, and no zone", () => {
    expect(f.bands).toEqual([]);
    const cls = f.lessons.find((l) => l.subject === "Φυσική (ΓΘ)" && l.teacher === "Φ1")!;
    const one = f.lessons.find((l) => l.subject === "Φυσική (ΓΘ)" && l.teacher === "Φ2")!;
    expect(cls).toMatchObject({ audience: "SUBSET", students: ["p1", "p2"], band: null, supportKind: null });
    expect(one).toMatchObject({ audience: "SUBSET", students: ["p3"], band: null, supportKind: "AST", during: null });
    expect(f.students.find((s) => s.externalId === "p3")!.excusedFrom).toEqual([cls.key]);
    expect(r.notes.some((n) => n.includes("ΑΣΤ with an excusal"))).toBe(true);
  });

  it("keeps a 'support' group that names every pupil as the groups' own lesson", () => {
    const chem = f.lessons.find((l) => l.subject === "Χημεία (ΓΘ)")!;
    expect(chem).toMatchObject({ audience: "ALL", students: null, during: null, supportKind: null });
    expect(r.notes.some((n) => n.includes("all pupils listed"))).toBe(true);
  });
});

