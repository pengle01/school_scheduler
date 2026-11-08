"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useErrorToast } from "@/components/useErrorToast";
import { periodExists, maxPeriods, nextSlotKind, DEFAULT_DAYS_PERIODS, type SlotKind } from "@/lib/calendar";
import { teacherLoad } from "@/lib/load";
import { cn } from "@/lib/utils";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri"] as const;

type Grid = Map<string, SlotKind>; // "day-period" → kind
const key = (d: number, p: number) => `${d}-${p}`;

export function TeacherDetail({ id }: { id: string }) {
  const t = useTranslations("teacherDetail");
  const tDays = useTranslations("days");
  const locale = useLocale();
  const toastError = useErrorToast();
  const utils = trpc.useUtils();
  const teacher = trpc.teachers.byId.useQuery({ id });
  const settings = trpc.rules.settings.useQuery();
  const save = trpc.teachers.setUnavailability.useMutation({
    onSuccess: () => {
      utils.teachers.invalidate();
      toast.success(t("saved"));
    },
    onError: toastError,
  });

  const [grid, setGrid] = useState<Grid>(new Map());
  const [dirty, setDirty] = useState(false);

  // Load the grid from the server once per fetched teacher (derived state, no effect).
  const [synced, setSynced] = useState<typeof teacher.data>(undefined);
  if (teacher.data && teacher.data !== synced) {
    setSynced(teacher.data);
    const g: Grid = new Map();
    for (const u of teacher.data.unavailability) g.set(key(u.day, u.period), u.kind);
    setGrid(g);
    setDirty(false);
  }

  const daysPeriods = useMemo(() => settings.data?.daysPeriods ?? DEFAULT_DAYS_PERIODS, [settings.data]);
  const periods = useMemo(() => Array.from({ length: maxPeriods(daysPeriods) }, (_, i) => i + 1), [daysPeriods]);

  if (teacher.isLoading) return <p className="text-slate-500 text-sm">…</p>;
  if (!teacher.data) return <p className="text-slate-500 text-sm">{t("notFound")}</p>;
  const tr = teacher.data;
  const load = teacherLoad({ obligation: tr.obligation, reduction: tr.reduction, assigned: tr.lessons.reduce((a, l) => a + l.periods, 0) });

  const setSlot = (d: number, p: number, kind: SlotKind) => {
    setGrid((g) => {
      const n = new Map(g);
      if (kind === "FREE") n.delete(key(d, p));
      else n.set(key(d, p), kind);
      return n;
    });
    setDirty(true);
  };
  const toggle = (d: number, p: number) => setSlot(d, p, nextSlotKind(grid.get(key(d, p)) ?? "FREE"));
  const bulk = (cells: [number, number][]) => {
    // If every cell is already HARD → clear, else set HARD.
    const allHard = cells.every(([d, p]) => grid.get(key(d, p)) === "HARD");
    setGrid((g) => {
      const n = new Map(g);
      for (const [d, p] of cells) {
        if (allHard) n.delete(key(d, p));
        else n.set(key(d, p), "HARD");
      }
      return n;
    });
    setDirty(true);
  };
  const dayCells = (d: number): [number, number][] => periods.filter((p) => periodExists(d, p, daysPeriods)).map((p) => [d, p]);
  const rangeCells = (from: number, to: number): [number, number][] =>
    DAY_KEYS.flatMap((_, i) => periods.filter((p) => p >= from && p <= to && periodExists(i + 1, p, daysPeriods)).map((p) => [i + 1, p] as [number, number]));

  const hardCount = [...grid.values()].filter((k) => k === "HARD").length;
  const softCount = grid.size - hardCount;

  return (
    <>
      <PageHeader title={tr.name} description={[tr.firstName, tr.department].filter(Boolean).join(" · ")}>
        <Link href={`/${locale}/admin/teachers`} className="text-sm text-emerald-700 hover:underline">
          ← {t("back")}
        </Link>
      </PageHeader>

      <div className="grid lg:grid-cols-[1fr_380px] gap-5">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {t("availability")}
                <Badge variant="outline">{t("blocked", { hard: hardCount, soft: softCount })}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-500 mb-3">{t("legend")}</p>
              <div className="overflow-x-auto">
                <table className="text-sm select-none">
                  <thead>
                    <tr>
                      <th className="w-10" />
                      {DAY_KEYS.map((d, i) => (
                        <th key={d} className="px-1 pb-1 font-medium text-slate-600">
                          <button type="button" className="hover:text-emerald-700" onClick={() => bulk(dayCells(i + 1))}>
                            {tDays(d)}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((p) => (
                      <tr key={p}>
                        <td className="pr-2 text-right text-slate-500">{p}</td>
                        {DAY_KEYS.map((_, i) => {
                          const d = i + 1;
                          if (!periodExists(d, p, daysPeriods)) return <td key={d} className="p-0.5"><div className="w-14 h-9 rounded bg-slate-100" /></td>;
                          const kind = grid.get(key(d, p)) ?? "FREE";
                          return (
                            <td key={d} className="p-0.5">
                              <button
                                type="button"
                                onClick={() => toggle(d, p)}
                                aria-label={`${tDays(DAY_KEYS[i])} ${p}: ${kind}`}
                                className={cn(
                                  "w-14 h-9 rounded border text-xs font-medium transition-colors",
                                  kind === "FREE" && "bg-white border-slate-200 hover:bg-emerald-50",
                                  kind === "HARD" && "bg-red-500 border-red-600 text-white",
                                  kind === "SOFT" && "bg-amber-300 border-amber-400 text-amber-900",
                                )}
                              >
                                {kind === "FREE" ? "" : kind === "HARD" ? t("hardShort") : t("softShort")}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={() => bulk(rangeCells(1, 4))}>{t("bulkMorning")}</Button>
                <Button size="sm" variant="outline" onClick={() => bulk(rangeCells(5, 8))}>{t("bulkAfternoon")}</Button>
                <Button size="sm" variant="outline" onClick={() => { setGrid(new Map()); setDirty(true); }}>{t("bulkClear")}</Button>
                <Button
                  size="sm"
                  className="ml-auto"
                  disabled={!dirty || save.isPending}
                  onClick={() =>
                    save.mutate({
                      teacherId: id,
                      slots: [...grid.entries()].map(([k, kind]) => {
                        const [d, p] = k.split("-").map(Number);
                        return { day: d, period: p, kind: kind as "HARD" | "SOFT" };
                      }),
                    })
                  }
                >
                  {t("save")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("lessons")} <Badge variant="outline">{tr.lessons.length}</Badge></CardTitle>
            </CardHeader>
            <CardContent>
              {tr.lessons.length === 0 ? (
                <p className="text-sm text-slate-500">{t("noLessons")}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-slate-500 text-left">
                    <tr>
                      <th className="py-1 pr-2">{t("colGroup")}</th>
                      <th className="py-1 pr-2">{t("colSubject")}</th>
                      <th className="py-1 pr-2 text-right">{t("colPeriods")}</th>
                      <th className="py-1 pr-2">{t("colShape")}</th>
                      <th className="py-1">{t("colStructure")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tr.lessons.map((l) => (
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="py-1 pr-2">
                          {l.homeGroups.map((h, i) => (
                            <span key={h.homeGroupId}>
                              {i > 0 && "+"}
                              <Link className="hover:underline" href={`/${locale}/admin/home-groups/${h.homeGroupId}`}>{h.homeGroup.name}</Link>
                            </span>
                          ))}
                        </td>
                        <td className="py-1 pr-2">{l.subject.name}</td>
                        <td className="py-1 pr-2 text-right">{l.periods}</td>
                        <td className="py-1 pr-2 text-slate-500">{l.shape}</td>
                        <td className="py-1 text-slate-500 text-xs">
                          {l.supportKind ? `${l.supportKind} · ${l.hostLesson?.subject.name ?? ""}` : l.band ? l.band.name : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{t("load")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">{t("obligation")}</span><span>{tr.obligation}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{t("reduction")}</span><span>{tr.reduction}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{t("target")}</span><span>{load.target}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{t("assigned")}</span><span>{load.assigned}</span></div>
              <div className={cn("flex justify-between font-medium", load.status === "ok" ? "text-emerald-700" : load.status === "under" ? "text-amber-700" : "text-red-700")}>
                <span>{t("diff")}</span>
                <span>{load.diff > 0 ? `+${load.diff}` : load.diff}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("overrides")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {tr.ruleOverrides.length === 0 ? (
                <p className="text-slate-500">{t("noOverrides")}</p>
              ) : (
                <ul className="space-y-1">
                  {tr.ruleOverrides.map((o) => (
                    <li key={o.ruleId} className="flex justify-between">
                      <span>{o.rule.code}</span>
                      <span className="text-slate-600">{o.mode}{o.mode === "SOFT" ? ` (${o.weight})` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`/${locale}/admin/rules`} className="text-emerald-700 hover:underline text-xs block mt-2">
                {t("editOverrides")}
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
