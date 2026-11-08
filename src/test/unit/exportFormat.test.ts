import { describe, it, expect } from "vitest";
import { ExportV2Schema, ExportV1Schema, countImport, danglingReferences, normalizeSupport, subjectKey, studentRef, type ExportFile } from "@/lib/exportFormat";

const fixture: ExportFile = {
  format: "school-scheduler",
  version: 2,
  exportedAt: "2026-11-01T00:00:00.000Z",
  settings: { daysPeriods: [8, 7, 7, 8, 7] },
  teachers: [
    { name: "Μ-ΔΟΚΙΜΗ Α.", firstName: null, department: "Μ", obligation: 24, reduction: 0, active: true, note: null, unavailability: [{ day: 1, period: 3, kind: "HARD" }] },
  ],
  subjects: [{ name: "Μαθηματικά", code: "410222010", level: "A", periodsPerWeek: 3, note: null }],
  homeGroups: [
    { name: "ΗΥ1", year: "A", direction: "PRACTICE", note: null },
    { name: "ΕΓ1", year: "A", direction: "PRACTICE", note: null },
  ],
  students: [{ name: "Α", externalId: "1", homeGroup: "ΗΥ1", gender: "M", excusedFrom: [] }],
  bands: [{ name: "ΑΠ1ΕΠΙΛ", kind: "ELECTIVE", note: null, fixedSlots: null }],
  rooms: [],
  lessons: [
    { key: "L0001", subject: "Μαθηματικά", level: "A", homeGroups: ["ΗΥ1"], teacher: "Μ-ΔΟΚΙΜΗ Α.", periods: 3, shape: "1+1+1", audience: "ALL", students: null, during: null, supportKind: null, band: null, long: false, fixedRoom: null, roomMode: "ANY", roomKind: null, sameRoom: false, rooms: [], fixedSlots: null, note: null },
    { key: "L0002", subject: "Φυσική", level: "A", homeGroups: ["ΗΥ1", "ΜΟ1"], teacher: "Χ", periods: 2, shape: "2", audience: "SUBSET", students: ["1", "99"], during: "L0001", supportKind: "ST", band: "ΑΠ2ΕΠΙΛ", long: false, fixedRoom: null, roomMode: "ANY", roomKind: null, sameRoom: false, rooms: [], fixedSlots: null, note: null },
    { key: "L0003", subject: "Μαθηματικά", level: "A", homeGroups: ["ΗΥ1"], teacher: null, periods: 1, shape: "1", audience: "ALL", students: null, during: "L0099", supportKind: null, band: null, long: false, fixedRoom: null, roomMode: "ANY", roomKind: null, sameRoom: false, rooms: [], fixedSlots: null, note: null },
  ],
  rules: [{ code: "T2", mode: "SOFT", weight: 3, params: { max: 2 }, overrides: [{ teacher: "Μ-ΔΟΚΙΜΗ Α.", mode: "HARD", weight: 1 }] }],
};

describe("ExportV2Schema", () => {
  it("accepts the fixture and fills defaults", () => {
    const parsed = ExportV2Schema.parse({ ...fixture, bands: [{ name: "X" }] });
    expect(parsed.bands[0].kind).toBe("ELECTIVE");
  });

  it("rejects another format and the old version", () => {
    expect(ExportV2Schema.safeParse({ ...fixture, format: "orologio" }).success).toBe(false);
    expect(ExportV2Schema.safeParse({ ...fixture, version: 1 }).success).toBe(false);
  });

  it("still reads a v1 file", () => {
    const v1 = { ...fixture, version: 1, groups: [], pools: [], students: [], lessons: [] };
    delete (v1 as Partial<typeof v1>).homeGroups;
    delete (v1 as Partial<typeof v1>).bands;
    expect(ExportV1Schema.safeParse(v1).success).toBe(true);
  });
});

describe("countImport", () => {
  it("counts every table", () => {
    expect(countImport(fixture)).toEqual({ teachers: 1, subjects: 1, homeGroups: 2, students: 1, bands: 1, rooms: 0, lessons: 3, rules: 1 });
  });
});

describe("danglingReferences", () => {
  it("lists names used but not defined and structural contradictions", () => {
    const problems = danglingReferences(fixture);
    expect(problems).toContain("lessons[1].subject=Φυσική|A");
    expect(problems).toContain("lessons[1].homeGroups=ΜΟ1");
    expect(problems).toContain("lessons[1].teacher=Χ");
    expect(problems).toContain("lessons[1].band=ΑΠ2ΕΠΙΛ");
    expect(problems).toContain("lessons[1].students=99");
    expect(problems).toContain("lessons[1]: both during and band");
    expect(problems).toContain("lessons[2].during=L0099");
    expect(problems).not.toContain("lessons[0].homeGroups=ΗΥ1");
  });

  it("keys subjects by name and level, pupils by externalId else name", () => {
    expect(subjectKey({ name: "Μαθηματικά", level: "A" })).toBe("Μαθηματικά|A");
    expect(studentRef({ externalId: "7", name: "x" })).toBe("7");
    expect(studentRef({ externalId: null, name: "x" })).toBe("x");
  });
});

describe("normalizeSupport", () => {
  const withKind = (supportKind: "ST" | "AST" | "EXST"): ExportFile => ({
    ...fixture,
    lessons: [{ ...fixture.lessons[1], key: "S", during: "H", supportKind, band: null, students: ["1"] }],
  });
  it("turns the host of ΑΣΤ and ΕΞΣΤ into an excusal of their pupils", () => {
    for (const kind of ["AST", "EXST"] as const) {
      const r = normalizeSupport(withKind(kind));
      expect(r.lessons[0].during).toBeNull();
      expect(r.students[0].excusedFrom).toEqual(["H"]);
    }
  });
  it("leaves ΣΤ during its host", () => {
    const r = normalizeSupport(withKind("ST"));
    expect(r.lessons[0].during).toBe("H");
    expect(r.students[0].excusedFrom).toEqual([]);
  });
  it("reports ΣΤ without a host and excusals of unknown lessons", () => {
    const f = withKind("ST");
    f.lessons[0].during = null;
    f.students = [{ ...f.students[0], excusedFrom: ["L9"] }];
    const problems = danglingReferences(f);
    expect(problems).toContain("lessons[0]: ΣΤ without during");
    expect(problems).toContain("students[0].excusedFrom=L9");
  });
});
