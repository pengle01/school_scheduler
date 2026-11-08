"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/client";
import type { RouterOutputs } from "@/trpc/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WeekGrid, DAY_KEYS, type GridCell } from "@/components/WeekGrid";
import { useErrorToast } from "@/components/useErrorToast";
import { DEFAULT_DAYS_PERIODS } from "@/lib/calendar";
import { slotsOf, toggleSlot, zoneGridIssues, zonePeriods, type ZoneIssue } from "@/lib/zoneGrid";
import { cn } from "@/lib/utils";

type Zone = RouterOutputs["bands"]["grid"][number];

export function ZoneGrid() {
  const t = useTranslations("zoneGrid");
  const tDays = useTranslations("days");
  const tEnum = useTranslations("enums");
  const toastError = useErrorToast();
  const utils = trpc.useUtils();
  const grid = trpc.bands.grid.useQuery();
  const teachers = trpc.teachers.list.useQuery();
  const settings = trpc.rules.settings.useQuery();
  const daysPeriods = settings.data?.daysPeriods ?? DEFAULT_DAYS_PERIODS;
  const save = trpc.bands.setFixedSlots.useMutation({ onSuccess: () => Promise.all([utils.bands.invalidate()]), onError: toastError });

  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const zones: Zone[] = useMemo(() => grid.data ?? [], [grid.data]);
  const zone = zones.find((z) => z.id === selected) ?? null;
  const issues = useMemo(() => zoneGridIssues(zones, daysPeriods), [zones, daysPeriods]);
  const issuesOf = (name: string) => issues.filter((i) => ("zone" in i ? i.zone === name : i.zones.includes(name)));
  const teacherName = (id: string) => teachers.data?.find((x) => x.id === id)?.name ?? id;

  const bySlot = useMemo(() => {
    const m = new Map<number, Zone[]>();
    for (const z of zones) for (const [d, p] of slotsOf(z.fixedSlots)) m.set(d * 100 + p, [...(m.get(d * 100 + p) ?? []), z]);
    return m;
  }, [zones]);
  const conflictSlots = useMemo(() => new Set(issues.filter((i) => i.kind === "teacher" || i.kind === "pupil").map((i) => (i as { day: number; period: number }).day * 100 + (i as { period: number }).period)), [issues]);

  const cells = (day: number, period: number): GridCell => {
    const here = bySlot.get(day * 100 + period) ?? [];
    const mine = !!zone && here.some((z) => z.id === zone.id);
    return {
      chips: here.map((z) => ({ id: z.id, title: z.name, subtitle: t("options", { n: z.options.length }), tone: z.id === zone?.id ? "band" : "normal" })),
      clash: conflictSlots.has(day * 100 + period),
      shade: mine ? "soft" : null,
    };
  };

  const describe = (i: ZoneIssue) => {
    if (i.kind === "unplaced") return t("issue.unplaced", { zone: i.zone });
    if (i.kind === "periods") return t("issue.periods", { zone: i.zone, slots: i.slots, periods: i.periods });
    if (i.kind === "outsideWeek") return t("issue.outsideWeek", { zone: i.zone, day: tDays(DAY_KEYS[i.day - 1]), period: i.period });
    if (i.kind === "teacher") return t("issue.teacher", { teacher: teacherName(i.teacherId), day: tDays(DAY_KEYS[i.day - 1]), period: i.period, zones: i.zones.join(", ") });
    return t("issue.pupil", { pupils: i.pupils, day: tDays(DAY_KEYS[i.day - 1]), period: i.period, zones: i.zones.join(", ") });
  };

  const q = filter.trim().toLowerCase();
  const shown = zones.filter((z) => !q || z.name.toLowerCase().includes(q) || z.options.some((o) => o.subject.toLowerCase().includes(q) || o.teacher?.toLowerCase().includes(q)));
  const placed = zones.filter((z) => slotsOf(z.fixedSlots).length > 0).length;

  if (grid.isLoading) return <p className="text-sm text-slate-500">…</p>;

  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-4 items-start">
      <div className="space-y-2">
        <div className="text-xs text-slate-500">{t("placed", { placed, total: zones.length })}</div>
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("search")} className="h-8 text-sm" />
        <div className="max-h-[60vh] overflow-auto rounded-md border border-slate-200 bg-white divide-y divide-slate-100">
          {shown.map((z) => {
            const n = slotsOf(z.fixedSlots).length;
            const bad = issuesOf(z.name).length;
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => setSelected(z.id === selected ? null : z.id)}
                className={cn("w-full text-left px-2.5 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-2", z.id === selected && "bg-violet-50 text-violet-900")}
              >
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-medium">{z.name}</span>
                  <span className="block text-xs text-slate-400 truncate">
                    {tEnum(`bandKind.${z.kind}`)} · {t("options", { n: z.options.length })} · {t("periods", { n: zonePeriods(z) })}
                  </span>
                </span>
                <span className={cn("text-[10px] rounded-full px-1.5 py-0.5 shrink-0", n === 0 ? "bg-slate-100 text-slate-500" : bad ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800")}>
                  {n === 0 ? t("unplaced") : slotsOf(z.fixedSlots).map(([d, p]) => `${tDays(DAY_KEYS[d - 1])}${p}`).join(" ")}
                </span>
              </button>
            );
          })}
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-2 text-xs max-h-[28vh] overflow-auto">
          <div className="font-medium text-slate-700 mb-1">{t("issues")}</div>
          {issues.length === 0 ? (
            <div className="text-emerald-700">{t("noIssues")}</div>
          ) : (
            issues.map((i, k) => (
              <div key={k} className={cn(i.kind === "unplaced" ? "text-slate-500" : "text-red-700")}>
                {describe(i)}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-2 min-h-8">
          {zone ? (
            <>
              <h3 className="font-semibold text-slate-800">{zone.name}</h3>
              <span className="text-xs text-slate-500">{zone.options.map((o) => `${o.subject} (${o.teacher ?? "—"})`).join(" · ")}</span>
              <Button size="sm" variant="outline" className="ml-auto" disabled={!zone.fixedSlots || save.isPending} onClick={() => save.mutate({ id: zone.id, fixedSlots: null })}>
                {t("clear")}
              </Button>
            </>
          ) : (
            <span className="text-xs text-slate-500">{t("legend")}</span>
          )}
        </div>
        <WeekGrid
          daysPeriods={daysPeriods}
          cells={cells}
          selected={zone?.id ?? null}
          onChip={(id) => setSelected(id)}
          onCell={zone ? (day, period) => save.mutate({ id: zone.id, fixedSlots: toggleSlot(zone.fixedSlots, day, period) }) : undefined}
        />
        {zone && <p className="text-xs text-slate-500">{t("legend")}</p>}
      </div>
    </div>
  );
}
