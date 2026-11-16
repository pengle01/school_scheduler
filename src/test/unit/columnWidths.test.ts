import { describe, expect, it } from "vitest";
import { clampWidth, parseWidths, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH } from "@/lib/columnWidths";

const defaults = { subject: 200, teacher: 140 };

describe("clampWidth", () => {
  it("rounds and keeps the width inside the limits", () => {
    expect(clampWidth(150.6)).toBe(151);
    expect(clampWidth(-5)).toBe(MIN_COLUMN_WIDTH);
    expect(clampWidth(99999)).toBe(MAX_COLUMN_WIDTH);
  });
});

describe("parseWidths", () => {
  it("returns the defaults when nothing is stored or the text is not JSON", () => {
    expect(parseWidths(null, defaults)).toEqual(defaults);
    expect(parseWidths("{oops", defaults)).toEqual(defaults);
    expect(parseWidths("[1,2]", defaults)).toEqual(defaults);
  });

  it("lays valid stored widths over the defaults", () => {
    expect(parseWidths('{"subject":320}', defaults)).toEqual({ subject: 320, teacher: 140 });
  });

  it("ignores unknown columns and bad values, and clamps", () => {
    expect(parseWidths('{"subject":"wide","teacher":5,"other":300}', defaults)).toEqual({ subject: 200, teacher: MIN_COLUMN_WIDTH });
  });

  it("does not change the defaults object", () => {
    parseWidths('{"subject":320}', defaults);
    expect(defaults.subject).toBe(200);
  });
});
