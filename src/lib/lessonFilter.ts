// Per-column filters of the lesson table: each column has a text the user's filter is matched
// against (the same words the cell shows), and the number columns also accept comparisons.

export type FilterColumn = "groups" | "subject" | "teacher" | "periods" | "shape" | "pupils" | "structure" | "rooms" | "note";
export type ColumnFilters = Partial<Record<FilterColumn, string>>;

export const FILTER_COLUMNS: FilterColumn[] = ["groups", "subject", "teacher", "periods", "shape", "pupils", "structure", "rooms", "note"];

// What a lesson row must offer; RouterOutputs["lessons"]["list"][number] fits.
export interface FilterableLesson {
  homeGroups: { homeGroup: { name: string } }[];
  subject: { name: string };
  teacher: { name: string } | null;
  periods: number;
  shape: string;
  crossDay: boolean;
  audience: string;
  students: unknown[];
  supportKind: string | null;
  hostLesson: { subject: { name: string } } | null;
  band: { name: string } | null;
  roomMode: string;
  roomKind: string | null;
  rooms: { room: { name: string } }[];
  sameRoom: boolean;
  note: string | null;
}

// Translated words the cells show, so a filter finds what the user sees.
export interface FilterLabels {
  vacancy: string;
  all: string;
  merge: string;
  band: string;
  during: string;
  supportKind: Record<string, string>;
}

// Lower case, without accents, final sigma as sigma: "Μαθηματικά" matches "μαθηματικα".
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ς/g, "σ")
    .trim();
}

// "3", "=3", ">3", ">=3", "<3", "<=3", "2-4". null when the text is not such an expression.
export function matchNumber(value: number, expr: string): boolean | null {
  const e = expr.replace(/\s+/g, "");
  const range = /^(\d+)-(\d+)$/.exec(e);
  if (range) return value >= Number(range[1]) && value <= Number(range[2]);
  const cmp = /^(>=|<=|>|<|=)?(\d+)$/.exec(e);
  if (!cmp) return null;
  const n = Number(cmp[2]);
  switch (cmp[1]) {
    case ">=":
      return value >= n;
    case "<=":
      return value <= n;
    case ">":
      return value > n;
    case "<":
      return value < n;
    default:
      return value === n;
  }
}

// The text of each column, as the table shows it. Rooms start with "=" (only these) or "≈" (preference).
export function lessonColumnText(l: FilterableLesson, labels: FilterLabels): Record<FilterColumn, string> {
  const structure = l.supportKind
    ? `${labels.supportKind[l.supportKind] ?? l.supportKind}${l.hostLesson ? ` ${labels.during} ${l.hostLesson.subject.name}` : ""}`
    : l.band
      ? `${labels.band} ${l.band.name}`
      : l.homeGroups.length > 1
        ? labels.merge
        : "";
  const rooms = l.roomMode === "ANY" ? (l.roomKind ?? "") : `${l.roomMode === "ONLY" ? "=" : "≈"} ${l.rooms.map((r) => r.room.name).join(", ")}`;
  return {
    groups: l.homeGroups.map((h) => h.homeGroup.name).join("+"),
    subject: l.subject.name,
    teacher: l.teacher?.name ?? labels.vacancy,
    periods: String(l.periods),
    shape: `${l.shape}${l.crossDay ? " ↷" : ""}`,
    pupils: l.audience === "SUBSET" ? String(l.students.length) : labels.all,
    structure,
    rooms: `${rooms}${l.sameRoom ? " 1" : ""}`,
    note: l.note ?? "",
  };
}

// Every non-empty filter must match its column. Periods and pupils take number expressions
// (pupils only for lessons with named pupils); anything else is "contains", ignoring case and accents.
export function matchesColumnFilters(l: FilterableLesson, filters: ColumnFilters, labels: FilterLabels): boolean {
  let text: Record<FilterColumn, string> | null = null;
  for (const column of FILTER_COLUMNS) {
    const filter = filters[column]?.trim();
    if (!filter) continue;
    if (column === "periods" || (column === "pupils" && l.audience === "SUBSET")) {
      const hit = matchNumber(column === "periods" ? l.periods : l.students.length, filter);
      if (hit !== null) {
        if (!hit) return false;
        continue;
      }
    }
    text ??= lessonColumnText(l, labels);
    if (!normalizeText(text[column]).includes(normalizeText(filter))) return false;
  }
  return true;
}

// The "same room for every period" switch as a filter of its own: every lesson, only those with it, only those without.
export type SameRoomFilter = "ANY" | "ON" | "OFF";
export const SAME_ROOM_FILTERS: SameRoomFilter[] = ["ANY", "ON", "OFF"];

export function matchesSameRoom(l: { sameRoom: boolean }, filter: SameRoomFilter): boolean {
  return filter === "ANY" || l.sameRoom === (filter === "ON");
}

export function hasColumnFilters(filters: ColumnFilters): boolean {
  return FILTER_COLUMNS.some((c) => !!filters[c]?.trim());
}
