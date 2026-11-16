// One colour per support kind, used wherever a support lesson is shown (lesson table, timetable
// viewer, the Στήριξη screen). Full class names, so Tailwind sees them.

export type SupportKindName = "ST" | "AST" | "EXST";

export const SUPPORT_TONE: Record<SupportKindName, { badge: string; chip: string; row: string }> = {
  ST: {
    badge: "bg-orange-100 border-orange-300 text-orange-900",
    chip: "bg-orange-100 border-orange-300 hover:border-orange-500",
    row: "border-l-4 border-l-orange-400",
  },
  AST: {
    badge: "bg-teal-100 border-teal-300 text-teal-900",
    chip: "bg-teal-100 border-teal-300 hover:border-teal-500",
    row: "border-l-4 border-l-teal-400",
  },
  EXST: {
    badge: "bg-pink-100 border-pink-300 text-pink-900",
    chip: "bg-pink-100 border-pink-300 hover:border-pink-500",
    row: "border-l-4 border-l-pink-400",
  },
};
