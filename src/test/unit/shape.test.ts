import { describe, it, expect } from "vitest";
import { parseShape, formatShape, shapeMatchesPeriods, defaultShape, normaliseShape } from "@/lib/shape";

describe("parseShape", () => {
  it("reads chunks and sorts them largest first", () => {
    expect(parseShape("1+2+1")).toEqual([2, 1, 1]);
    expect(parseShape("3+3")).toEqual([3, 3]);
    expect(parseShape(" 2 + 2 ")).toEqual([2, 2]);
  });

  it("rejects text that is not a sum of chunks", () => {
    expect(parseShape("")).toBeNull();
    expect(parseShape("2 ή 1+1")).toBeNull();
    expect(parseShape("ΝΑΙ")).toBeNull();
    expect(parseShape("0+2")).toBeNull();
    expect(parseShape("9")).toBeNull();
  });
});

describe("shapeMatchesPeriods", () => {
  it("is true only when the chunks sum to the periods", () => {
    expect(shapeMatchesPeriods("2+1+1", 4)).toBe(true);
    expect(shapeMatchesPeriods("3+3", 6)).toBe(true);
    expect(shapeMatchesPeriods("2+2", 5)).toBe(false);
    expect(shapeMatchesPeriods("abc", 3)).toBe(false);
  });
});

describe("defaultShape", () => {
  it("is all singles", () => {
    expect(defaultShape(1)).toBe("1");
    expect(defaultShape(4)).toBe("1+1+1+1");
    expect(defaultShape(0)).toBe("");
  });
});

describe("normaliseShape", () => {
  it("accepts spaces, commas and slashes as separators", () => {
    expect(normaliseShape("2 1 1", 4)).toBe("2+1+1");
    expect(normaliseShape("1,2,1", 4)).toBe("2+1+1");
    expect(normaliseShape("3/3", 6)).toBe("3+3");
  });

  it("returns null when the sum does not match", () => {
    expect(normaliseShape("2+2", 3)).toBeNull();
    expect(normaliseShape("", 3)).toBeNull();
  });

  it("formats chunks largest first", () => {
    expect(formatShape([1, 3, 2])).toBe("3+2+1");
  });
});
