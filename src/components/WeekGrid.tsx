"use client";

import { useTranslations } from "next-intl";
import { periodExists, maxPeriods, DEFAULT_DAYS_PERIODS } from "@/lib/calendar";
import { cn } from "@/lib/utils";

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri"] as const;

export type GridChip = {
  id: string; // unique within the grid (lesson id)
  title: string;
  subtitle?: string;
  room?: string | null;
  tone?: "normal" | "support" | "band" | "merge";
};

export type GridCell = {
  chips: GridChip[];
  clash?: boolean; // more than one lesson for one person
  shade?: "hard" | "soft" | null; // teacher unavailability
};

/** A 5-day week grid. `cells(day, period)` returns the content; a click on a chip reports it. */
export function WeekGrid({
  daysPeriods = DEFAULT_DAYS_PERIODS,
  cells,
  onChip,
  onCell,
  selected,
  highlight,
}: {
  daysPeriods?: number[];
  cells: (day: number, period: number) => GridCell;
  onChip?: (chipId: string, day: number, period: number) => void;
  onCell?: (day: number, period: number) => void; // click on the cell itself (the zone grid toggles a slot)
  selected?: string | null; // chip id to outline everywhere
  highlight?: { day: number; period: number } | null;
}) {
  const tDays = useTranslations("days");
  const t = useTranslations("timetable");
  const periods = Array.from({ length: maxPeriods(daysPeriods) }, (_, i) => i + 1);
  const toneClass: Record<NonNullable<GridChip["tone"]>, string> = {
    normal: "bg-white border-slate-200 hover:border-emerald-400",
    support: "bg-amber-50 border-amber-200 hover:border-amber-400",
    band: "bg-violet-50 border-violet-200 hover:border-violet-400",
    merge: "bg-sky-50 border-sky-200 hover:border-sky-400",
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs [&_td]:border [&_th]:border [&_td]:border-slate-200 [&_th]:border-slate-200 min-w-[760px]">
        <thead>
          <tr className="bg-slate-50 text-slate-600">
            <th className="w-10 py-1.5">#</th>
            {DAY_KEYS.map((d) => (
              <th key={d} className="py-1.5 font-medium">
                {tDays(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p}>
              <th className="bg-slate-50 text-slate-500 font-medium">{p}</th>
              {DAY_KEYS.map((_, i) => {
                const day = i + 1;
                if (!periodExists(day, p, daysPeriods)) return <td key={day} className="bg-slate-100/70" />;
                const cell = cells(day, p);
                const isHl = highlight?.day === day && highlight?.period === p;
                return (
                  <td
                    key={day}
                    onClick={onCell ? () => onCell(day, p) : undefined}
                    className={cn(
                      "align-top p-1 h-14 w-1/5",
                      onCell && "cursor-pointer hover:bg-emerald-50/60",
                      cell.shade === "hard" && "bg-slate-200/70",
                      cell.shade === "soft" && "bg-yellow-50",
                      cell.clash && "bg-red-100",
                      isHl && "ring-2 ring-inset ring-emerald-500",
                    )}
                    title={cell.clash ? t("clash") : cell.shade === "hard" ? t("unavailable") : cell.shade === "soft" ? t("preferFree") : undefined}
                  >
                    <div className="flex flex-col gap-1">
                      {cell.chips.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={(e) => {
                            if (onChip) {
                              e.stopPropagation();
                              onChip(c.id, day, p);
                            }
                          }}
                          className={cn(
                            "text-left rounded border px-1.5 py-1 leading-tight w-full",
                            toneClass[c.tone ?? "normal"],
                            selected === c.id && "ring-2 ring-emerald-600",
                          )}
                        >
                          <div className="font-medium text-slate-800 truncate">{c.title}</div>
                          {(c.subtitle || c.room) && (
                            <div className="text-slate-500 truncate">
                              {c.subtitle}
                              {c.room ? <span className="ml-1 text-slate-400">@{c.room}</span> : null}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
