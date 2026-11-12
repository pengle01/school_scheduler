import { describe, it, expect } from "vitest";
import { formatRoomList, parseRoomList } from "@/lib/roomList";

const rooms = [
  { id: "a", name: "121" },
  { id: "b", name: "33" },
  { id: "c", name: "124α" },
  { id: "d", name: "ΒΙΒΛ" },
];

describe("parseRoomList", () => {
  it("keeps the written order and accepts commas, spaces, slashes and new lines", () => {
    expect(parseRoomList("121, 33", rooms).ids).toEqual(["a", "b"]);
    expect(parseRoomList("33/121", rooms).ids).toEqual(["b", "a"]);
    expect(parseRoomList("121\n33  ΒΙΒΛ", rooms).ids).toEqual(["a", "b", "d"]);
  });

  it("matches regardless of case, accents and Latin look-alike letters, and drops repeats", () => {
    expect(parseRoomList("124Α 124a βιβλ BIBΛ 121 121", rooms).ids).toEqual(["c", "d", "a"]);
  });

  it("reports names that match no room", () => {
    expect(parseRoomList("121, 999, Λ9", rooms)).toEqual({ ids: ["a"], unknown: ["999", "Λ9"] });
    expect(parseRoomList("  ", rooms)).toEqual({ ids: [], unknown: [] });
  });
});

describe("formatRoomList", () => {
  it("writes the names in order", () => {
    expect(formatRoomList(["b", "a"], rooms)).toBe("33, 121");
  });
});
