import { describe, expect, it } from "vitest";
import { hasColumnFilters, lessonColumnText, matchNumber, matchesColumnFilters, normalizeText, type FilterableLesson } from "@/lib/lessonFilter";

const labels = { vacancy: "κενή θέση", all: "όλοι", merge: "συνδιδασκαλία", band: "ζώνη", during: "κατά", supportKind: { ST: "ΣΤ — στήριξη", AST: "ΑΣΤ" } };

function lesson(over: Partial<FilterableLesson> = {}): FilterableLesson {
  return {
    homeGroups: [{ homeGroup: { name: "ΗΥ1" } }],
    subject: { name: "Μαθηματικά (ΑΠ)" },
    teacher: { name: "Μ-ΔΟΚΙΜΗ Α." },
    periods: 4,
    shape: "2+1+1",
    crossDay: false,
    audience: "ALL",
    students: [],
    supportKind: null,
    hostLesson: null,
    band: null,
    roomMode: "PREFER",
    roomKind: null,
    rooms: [{ room: { name: "121" } }, { room: { name: "33" } }],
    sameRoom: false,
    note: null,
    ...over,
  };
}

describe("normalizeText", () => {
  it("ignores case, accents and the final sigma", () => {
    expect(normalizeText("Μαθηματικά")).toBe("μαθηματικα");
    expect(normalizeText(" ΤΟΜΕΑΣ ")).toBe(normalizeText("τομέας"));
  });
});

describe("matchNumber", () => {
  it("compares", () => {
    expect(matchNumber(3, "3")).toBe(true);
    expect(matchNumber(3, "=4")).toBe(false);
    expect(matchNumber(3, ">2")).toBe(true);
    expect(matchNumber(3, ">= 3")).toBe(true);
    expect(matchNumber(3, "<3")).toBe(false);
    expect(matchNumber(3, "<=3")).toBe(true);
    expect(matchNumber(3, "2-4")).toBe(true);
    expect(matchNumber(5, "2-4")).toBe(false);
  });
  it("returns null for anything else", () => {
    expect(matchNumber(3, "abc")).toBeNull();
    expect(matchNumber(3, ">")).toBeNull();
  });
});

describe("lessonColumnText", () => {
  it("shows what the table shows", () => {
    const text = lessonColumnText(lesson({ sameRoom: true }), labels);
    expect(text.groups).toBe("ΗΥ1");
    expect(text.rooms).toBe("≈ 121, 33 1");
    expect(text.pupils).toBe("όλοι");
    expect(text.structure).toBe("");
  });
  it("describes the structures", () => {
    expect(lessonColumnText(lesson({ supportKind: "ST", hostLesson: { subject: { name: "Γαλλικά (ΑΠ)" } } }), labels).structure).toBe("ΣΤ — στήριξη κατά Γαλλικά (ΑΠ)");
    expect(lessonColumnText(lesson({ band: { name: "ΒΠ2ΕΠΙΛ" } }), labels).structure).toBe("ζώνη ΒΠ2ΕΠΙΛ");
    expect(lessonColumnText(lesson({ homeGroups: [{ homeGroup: { name: "ΜΟ1α" } }, { homeGroup: { name: "ΜΟ1β" } }] }), labels).structure).toBe("συνδιδασκαλία");
  });
  it("marks strict rooms, room types and vacancies", () => {
    expect(lessonColumnText(lesson({ roomMode: "ONLY" }), labels).rooms).toBe("= 121, 33");
    expect(lessonColumnText(lesson({ roomMode: "ANY", roomKind: "Εργ. Η/Υ", rooms: [] }), labels).rooms).toBe("Εργ. Η/Υ");
    expect(lessonColumnText(lesson({ teacher: null }), labels).teacher).toBe("κενή θέση");
  });
});

describe("matchesColumnFilters", () => {
  it("matches everything when no filter is set", () => {
    expect(matchesColumnFilters(lesson(), {}, labels)).toBe(true);
    expect(matchesColumnFilters(lesson(), { subject: "  " }, labels)).toBe(true);
  });
  it("needs every filter to match", () => {
    expect(matchesColumnFilters(lesson(), { subject: "μαθημ", groups: "ηυ" }, labels)).toBe(true);
    expect(matchesColumnFilters(lesson(), { subject: "μαθημ", groups: "μο" }, labels)).toBe(false);
  });
  it("takes number expressions for periods", () => {
    expect(matchesColumnFilters(lesson(), { periods: ">3" }, labels)).toBe(true);
    expect(matchesColumnFilters(lesson(), { periods: "2-3" }, labels)).toBe(false);
    expect(matchesColumnFilters(lesson({ periods: 14 }), { periods: "4" }, labels)).toBe(false);
  });
  it("counts pupils only where pupils are named", () => {
    const subset = lesson({ audience: "SUBSET", students: [1, 2, 3] });
    expect(matchesColumnFilters(subset, { pupils: "<5" }, labels)).toBe(true);
    expect(matchesColumnFilters(lesson(), { pupils: "<5" }, labels)).toBe(false);
    expect(matchesColumnFilters(lesson(), { pupils: "όλοι" }, labels)).toBe(true);
  });
  it("finds strict rooms with '='", () => {
    expect(matchesColumnFilters(lesson({ roomMode: "ONLY" }), { rooms: "=" }, labels)).toBe(true);
    expect(matchesColumnFilters(lesson(), { rooms: "=" }, labels)).toBe(false);
    expect(matchesColumnFilters(lesson(), { rooms: "33" }, labels)).toBe(true);
  });
});

describe("hasColumnFilters", () => {
  it("is true only for a non-blank filter", () => {
    expect(hasColumnFilters({})).toBe(false);
    expect(hasColumnFilters({ note: " " })).toBe(false);
    expect(hasColumnFilters({ note: "x" })).toBe(true);
  });
});
