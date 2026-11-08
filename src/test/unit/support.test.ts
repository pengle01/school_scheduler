import { describe, it, expect } from "vitest";
import { stIssues, type StLesson } from "@/lib/support";

const french = { id: "f", subject: "Γαλλικά (ΑΠ)", periods: 2, bandId: null };
const st = (subject: string, host: StLesson["host"] = french): StLesson => ({ subject, periods: 1, host });

describe("stIssues", () => {
  it("accepts one Greek and one Maths during 2-period French, and no ΣΤ at all", () => {
    expect(stIssues([st("Νέα Ελληνικά (ΑΠ)"), st("Μαθηματικά Εμβ. 3-ωρο")])).toEqual([]);
    expect(stIssues([])).toEqual([]);
  });

  it("accepts them in two separate 1-period French bands", () => {
    const a = { id: "a", subject: "Γαλλικά (ΑΠ)", periods: 1, bandId: "B1" };
    const b = { id: "b", subject: "Γαλλικά (ΑΠ)", periods: 1, bandId: "B2" };
    expect(stIssues([st("Νέα Ελληνικά (ΑΠ)", a), st("Μαθηματικά (ΑΠ)", b)])).toEqual([]);
  });

  it("flags both in the same 1-period French band", () => {
    const a = { id: "a", subject: "Γαλλικά (ΑΠ)", periods: 1, bandId: "B1" };
    const a2 = { id: "a2", subject: "Γαλλικά (ΑΠ)", periods: 1, bandId: "B1" };
    expect(stIssues([st("Νέα Ελληνικά (ΑΠ)", a), st("Μαθηματικά (ΑΠ)", a2)])).toEqual(["noRoomInFrench"]);
  });

  it("names a missing subject", () => {
    expect(stIssues([st("Μαθηματικά (ΑΠ)")])).toEqual(["noGreek"]);
    expect(stIssues([st("Νέα Ελληνικά (ΑΠ)")])).toEqual(["noMaths"]);
  });

  it("flags another subject, a third period, and a host that is not French", () => {
    expect(stIssues([st("Φυσική (ΑΠ)")])).toEqual(["noGreek", "noMaths", "otherSubject"]);
    expect(stIssues([st("Νέα Ελληνικά (ΑΠ)"), st("Νέα Ελληνικά (ΒΠ)"), st("Μαθηματικά (ΑΠ)")])).toEqual(["tooMany", "noRoomInFrench"]);
    const religion = { id: "r", subject: "Θρησκευτικά", periods: 2, bandId: null };
    expect(stIssues([st("Νέα Ελληνικά (ΑΠ)", religion), st("Μαθηματικά (ΑΠ)", religion)])).toEqual(["notFrench"]);
  });
});
