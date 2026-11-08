import { describe, it, expect } from "vitest";
import {
  parseRecords,
  parseRes,
  patternToShape,
  subjectLevel,
  groupKind,
  groupYear,
  groupDirection,
  canonicalGroupName,
  departmentOf,
} from "@/lib/orologio/parse";
import { convertOrologio } from "@/lib/orologio/convert";

describe("parseRecords", () => {
  it("splits typed lines into fields and skips the header", () => {
    const r = parseRecords('File=Orologio Data\r\nVersion=17.0\r\n2#Α-ΔΟΚΙΜΗ Β.#Όνομα3#0#32000#22#\r\n17011#   1   11#\r\n');
    expect(r.get(2)).toEqual([["Α-ΔΟΚΙΜΗ Β.", "Όνομα3", "0", "32000", "22"]]);
    expect(r.get(17011)).toEqual([["   1   11"]]);
    expect(r.has(99)).toBe(false);
  });
});

describe("parseRes", () => {
  it("reads the fixed-width columns", () => {
    const rows = parseRes("File=Orologio Result\nVersion=12.5\n  1  1   1  61   410212610\n  5  7 151   6   6 2141200\n");
    expect(rows[0]).toEqual({ day: 1, period: 1, teacher: 1, cls: 61, slot: 4, room: 102, subject: 126, flag: "10" });
    expect(rows[1]).toMatchObject({ day: 5, period: 7, teacher: 151, cls: 6, slot: 6, room: 21, subject: 412, flag: "00" });
  });
});

describe("patternToShape", () => {
  it("takes the prefix that sums to the hours", () => {
    expect(patternToShape("2  1  1  1  1", 5)).toBe("2+1+1+1");
    expect(patternToShape("3  3  1  1  1", 6)).toBe("3+3");
    expect(patternToShape("1  1  1  1  1", 1)).toBe("1");
  });
  it("falls back to singles when nothing fits", () => {
    expect(patternToShape("1  1  1  1  1", 7)).toBe("1+1+1+1+1+1+1");
    expect(patternToShape("", 2)).toBe("1+1");
  });
});

describe("name conventions", () => {
  it("reads the level suffix", () => {
    expect(subjectLevel("Μαθηματικά (ΑΠ)")).toBe("A");
    expect(subjectLevel("Φυσική (Β)")).toBe("B");
    expect(subjectLevel("Αγγλικά (ΓΘ)")).toBe("C");
    expect(subjectLevel("Υγιεινή")).toBe("NONE");
  });
  it("classifies groups", () => {
    expect(groupKind("ΗΥ1", true)).toBe("HOME");
    expect(groupKind("ΣΤ_ΗΥ1_ΕΛΛ1", false)).toBe("SUPPORT");
    expect(groupKind("ΕΞΣΤ_ΞΕ1δ_ΕΛΛ2", false)).toBe("SUPPORT");
    expect(groupKind("ΑΣΤ_ΞΕ3α_ΚΣ_ΑΓΓ", false)).toBe("PULLOUT");
    expect(groupKind("ΒΠ4Α2_2", false)).toBe("ELECTIVE");
    expect(groupKind("ΓΞ1Γ", false)).toBe("ELECTIVE");
    expect(groupKind("ΜΟ1α_ΜΟ1β", false)).toBe("MERGED");
    expect(groupKind("ΘΗΜ3+ΘΒΣ3", false)).toBe("MERGED");
  });
  it("derives year and direction", () => {
    expect(groupYear("ΘΔΜ3β")).toBe("C");
    expect(groupYear("ΑΞ1Ρ")).toBe("A");
    expect(groupYear("ΓΑΛ_ΗΥ1_1")).toBe("A");
    expect(groupDirection("ΘΗΨ2α")).toBe("THEORY");
    expect(groupDirection("ΗΥ1")).toBe("PRACTICE");
    expect(groupDirection("ΞΕ3α")).toBe("HOTEL");
    expect(groupDirection("ΕΜ2")).toBe("SPECIAL");
  });
  it("folds the '-' workaround groups into the real group", () => {
    expect(canonicalGroupName("ΓΞ1Γ-")).toBe("ΓΞ1Γ");
    expect(canonicalGroupName("ΓΞ1Γ")).toBe("ΓΞ1Γ");
  });
  it("takes the department from the name prefix, else from the specialty code", () => {
    expect(departmentOf("ΗΥ-ΔΟΚΙΜΗ Α. ΒΔ", "40500")).toBe("ΗΥ");
    expect(departmentOf("ΔΟΚΙΜΗ Α.", "40500")).toBe("ΗΥ");
    expect(departmentOf("ΔΟΚΙΜΗ Α.", "00000")).toBeNull();
  });
});

describe("convertOrologio", () => {
  // Two real classes (ΑΠ with 2 home groups, ΑΘ with 1), one pool with both ΑΠ groups,
  // a merged group drawing from them, a support group, two students, three lessons.
  const dat = [
    "2#Μ-ΠΑΠΑ Π.#Όνομα1#0#31200#24#0#0#1#0#2#" + "#0".repeat(40) + "#1########0#1#0#Α#",
    "2#Ε-ΚΩΣΤΑ Κ.#Όνομα2#0#31100#22#0#0#2#0#3#" + "#0".repeat(40) + "#2##1 ΩΡΑ ΠΙΣΤΩΣΗ######0#0#0#Α#",
    "3#0#1#2#" + "0#".repeat(80) + "ΑΠ#217#0#",
    "3#0#2#1#" + "0#".repeat(80) + "ΑΘ#218#0#",
    "3#1#1#2#1#1#" + "0#".repeat(38) + "1#2#" + "0#".repeat(38) + "ΑΠΜΑΘ##1#",
    "5#  1  2  3  0#",
    "5#  0  2  8  0#",
    "6#   1#ΗΥ1#0#16777215#2#405###1#0###",
    "6#   2#ΕΓ1#0#16777215#1#407###1#0###",
    "6#   3#ΘΜΓ1#0#16777215#0#409###1#0###",
    "6#   4#ΗΥ1_ΕΓ1#0#16777215#3####1#0###",
    "6#   5#ΣΤ_ΗΥ1_ΜΑΘ#0#16777215#1####1#0###",
    "41#   4#1#1#" + "0#".repeat(38) + "1#2#" + "0#".repeat(38),
    "13015#Μαθηματικά (ΑΠ)#000#12180223#0#1#32118#410222010#1#1##0#3#1##0#",
    "13015#Νέα Ελληνικά (ΑΠ)#000#12180223#0#1#32119#410222011#1#1##0#5#1##0#",
    "17010#Ατομο#1#9001#9002#ΗΥ1##0#Α#ΗΥ#<Καμμία>#",
    "17010#Ατομο#2#9003#9004###0#Θ#ΕΓ#<Καμμία>#",
    "17011#   1   11#",
    "17011#   1   51#",
    "17011#   2   21#",
  ].join("\r\n");
  const rel = ["3#   1#   1#  1#  3#  3#  2  1  1  1  1#0#0#", "3#   1#   2#  1#  3#  3#  1  1  1  1  1#0#0#", "3#   2#   4#  2#  5#  5#  2  2  1  1  1#0#0#", "3#   1#   5#  1#  1#  1#  1  1  1  1  1#0#0#"].join("\r\n");
  // Maths of ΗΥ1 and ΕΓ1 sit in pool ΑΠΜΑΘ (class row 3); Greek of the merged group under the real class.
  const res = [
    "File=Orologio Result",
    // columns: day(3) period(3) teacher(4) class(4) slot(4) room(3) subject(3) flag(2)
    ...[1, 2, 3].map((p) => `  1  ${p}   1   3   1 10  100`), // ΗΥ1 maths, pool row 3 slot 1
    ...[1, 2, 3].map((p) => `  1  ${p}   1   3   2 11  100`), // ΕΓ1 maths, pool row 3 slot 2, same slots (a zone)
    ...[1, 2, 3, 4, 5].map((p) => `  3  ${p}   2   1   1 12  200`), // merged-group Greek under real class ΑΠ slot 1
  ].join("\n");

  const { file, report } = convertOrologio({ dat, rel, res }, "Test");

  it("reads teachers with obligation, department, note, active flag and unavailability", () => {
    expect(file.teachers).toHaveLength(2);
    expect(file.teachers[0]).toMatchObject({ name: "Μ-ΠΑΠΑ Π.", firstName: "Όνομα1", department: "Μ", obligation: 24, active: true });
    expect(file.teachers[0].unavailability).toEqual([{ day: 2, period: 3, kind: "HARD" }]);
    expect(file.teachers[1]).toMatchObject({ note: "1 ΩΡΑ ΠΙΣΤΩΣΗ", active: false, unavailability: [] });
  });

  it("reads subjects with level and ministry code", () => {
    expect(file.subjects).toEqual([
      { name: "Μαθηματικά (ΑΠ)", level: "A", code: "410222010", periodsPerWeek: 3, note: null },
      { name: "Νέα Ελληνικά (ΑΠ)", level: "A", code: "410222011", periodsPerWeek: 5, note: null },
    ]);
  });

  it("keeps the home groups and resolves merged lessons through type 41", () => {
    expect(file.homeGroups.map((g) => g.name)).toEqual(["ΗΥ1", "ΕΓ1", "ΘΜΓ1"]);
    expect(file.homeGroups[0]).toMatchObject({ year: "A", direction: "PRACTICE" });
    const greek = file.lessons.find((l) => l.subject === "Νέα Ελληνικά (ΑΠ)")!;
    expect(greek).toMatchObject({ homeGroups: ["ΗΥ1", "ΕΓ1"], teacher: "Ε-ΚΩΣΤΑ Κ.", periods: 5, shape: "2+2+1", audience: "ALL", band: null, during: null });
  });

  it("reads students with their home group (declared or from membership)", () => {
    expect(file.students[0]).toMatchObject({ externalId: "9001", homeGroup: "ΗΥ1", gender: "M" });
    expect(file.students[1]).toMatchObject({ homeGroup: "ΕΓ1", gender: "F" });
  });

  it("turns the pool of two parallel maths lessons into a band and keeps a hostless support as a note", () => {
    expect(file.lessons).toHaveLength(4);
    const maths = file.lessons.filter((l) => l.subject === "Μαθηματικά (ΑΠ)" && !l.supportKind && l.audience === "ALL");
    expect(maths.map((l) => [l.homeGroups[0], l.shape, l.band])).toEqual([
      ["ΗΥ1", "2+1", "ΑΠΜΑΘ"],
      ["ΕΓ1", "1+1+1", "ΑΠΜΑΘ"],
    ]);
    // the zone grid: the slots every lesson of the pool was placed on
    expect(file.bands).toEqual([{ name: "ΑΠΜΑΘ", kind: "PARALLEL", note: null, fixedSlots: [{ day: 1, periods: [1, 2, 3] }] }]);
    const support = file.lessons.find((l) => l.note === "ΣΤ_ΗΥ1_ΜΑΘ")!;
    expect(support).toMatchObject({ homeGroups: ["ΗΥ1"], audience: "SUBSET", students: ["9001"], during: null });
    expect(report.structure.notes).toContain("support without host: ΣΤ_ΗΥ1_ΜΑΘ Μαθηματικά (ΑΠ)");
    expect(report).toMatchObject({ teachers: 2, groups: 5, students: 2, memberships: 3, pools: 1, lessons: 4, lessonsWithPool: 2, unavailability: 1 });
    expect(report.structure).toMatchObject({ homeGroups: 3, merges: 1, parallelBands: 1, bands: 0, frenchBlocks: 0 });
  });
});
