import { describe, it, expect } from "vitest";
import { RULES, RULE_CODES, ruleSpec, effectiveRule } from "@/lib/rulesCatalog";

describe("rule catalogue", () => {
  it("has unique codes and the rules the handoff names", () => {
    expect(new Set(RULE_CODES).size).toBe(RULES.length);
    for (const code of ["L1", "L4", "T1", "T2", "T3", "T4", "S1", "R1", "P1"]) expect(RULE_CODES).toContain(code);
  });

  it("gives soft rules a positive weight", () => {
    for (const r of RULES.filter((r) => r.mode === "SOFT")) expect(r.weight).toBeGreaterThan(0);
  });

  it("marks the teacher rules as overridable per teacher", () => {
    expect(ruleSpec("T2")?.perTeacher).toBe(true);
    expect(ruleSpec("T3")?.perTeacher).toBe(true);
    expect(ruleSpec("T4")?.perTeacher).toBe(true);
    expect(ruleSpec("S1")?.perTeacher).toBe(false);
    expect(ruleSpec("ZZ")).toBeUndefined();
  });
});

describe("effectiveRule", () => {
  it("lets an override replace the global mode and weight", () => {
    const rule = { mode: "SOFT" as const, weight: 3 };
    expect(effectiveRule(rule)).toEqual({ mode: "SOFT", weight: 3 });
    expect(effectiveRule(rule, null)).toEqual({ mode: "SOFT", weight: 3 });
    expect(effectiveRule(rule, { mode: "OFF", weight: 1 })).toEqual({ mode: "OFF", weight: 1 });
  });
});
