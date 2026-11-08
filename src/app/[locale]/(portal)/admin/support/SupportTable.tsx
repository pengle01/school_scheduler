"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { trpc } from "@/trpc/client";
import type { RouterOutputs } from "@/trpc/types";
import { Input } from "@/components/ui/input";
import { useErrorToast } from "@/components/useErrorToast";
import { DEFAULT_DAYS_PERIODS, totalSlots } from "@/lib/calendar";
import { StudentLessonsDialog } from "@/components/StudentLessonsDialog";
import { stIssues } from "@/lib/support";
import { cn } from "@/lib/utils";

type Lesson = RouterOutputs["lessons"]["list"][number];
type Filter = "problems" | "support" | "all";

const lessonLabel = (l: Lesson) => `${l.subject.name} · ${l.teacher?.name ?? "—"}`;

export function SupportTable() {
  const t = useTranslations("support");
  const toastError = useErrorToast();
  const utils = trpc.useUtils();
  const students = trpc.students.list.useQuery();
  const lessons = trpc.lessons.list.useQuery();
  const settings = trpc.rules.settings.useQuery();
  const setExcusals = trpc.students.setExcusals.useMutation({ onSuccess: () => utils.students.list.invalidate(), onError: toastError });

  const [filter, setFilter] = useState<Filter>("problems");
  const [search, setSearch] = useState("");
  const [openPupil, setOpenPupil] = useState<string | null>(null);

  const week = totalSlots(settings.data?.daysPeriods ?? DEFAULT_DAYS_PERIODS);

  const rows = useMemo(() => {
    const all = lessons.data ?? [];
    const byId = new Map(all.map((l) => [l.id, l]));
    return (students.data ?? []).map((s) => {
      const named = all.filter((l) => l.students.some((x) => x.studentId === s.id));
      const st = named.filter((l) => l.supportKind === "ST");
      const individual = named.filter((l) => l.supportKind === "AST" || l.supportKind === "EXST");
      const excused = s.excusals.map((e) => byId.get(e.lessonId)).filter((l): l is Lesson => !!l);
      const issues: { key: string; n?: number }[] = stIssues(
        st.map((l) => {
          const host = l.hostLessonId ? byId.get(l.hostLessonId) : undefined;
          return { subject: l.subject.name, periods: l.periods, host: host ? { id: host.id, subject: host.subject.name, periods: host.periods, bandId: host.bandId } : null };
        }),
      ).map((key) => ({ key }));
      if (individual.length > 0 && excused.length === 0) issues.push({ key: "noExcusal" });
      if (s.periods < week) issues.push({ key: "short", n: week - s.periods });
      if (s.periods > week) issues.push({ key: "over", n: s.periods - week });
      const options = all.filter(
        (l) =>
          !l.supportKind &&
          !excused.some((x) => x.id === l.id) &&
          (l.audience === "ALL" ? l.homeGroups.some((h) => h.homeGroupId === s.homeGroupId) : l.students.some((x) => x.studentId === s.id)),
      );
      return { s, st, individual, excused, issues, options };
    });
  }, [students.data, lessons.data, week]);

  const q = search.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (filter === "problems" && r.issues.length === 0) return false;
    if (filter === "support" && r.st.length + r.individual.length + r.excused.length === 0) return false;
    return !q || [r.s.name, r.s.externalId, r.s.homeGroup?.name].some((x) => x?.toLowerCase().includes(q));
  });

  if (students.isLoading || lessons.isLoading) return <p className="text-slate-500 text-sm">…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          {(["problems", "support", "all"] as const).map((f) => (
            <option key={f} value={f}>
              {t(`filter.${f}`)}
            </option>
          ))}
        </select>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")} className="h-9 max-w-sm text-sm" />
        <span className="text-xs text-slate-500">{t("count", { n: shown.length })}</span>
      </div>
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">{t("col.pupil")}</th>
              <th className="px-3 py-2">{t("col.group")}</th>
              <th className="px-3 py-2">{t("col.st")}</th>
              <th className="px-3 py-2">{t("col.individual")}</th>
              <th className="px-3 py-2">{t("col.excused")}</th>
              <th className="px-3 py-2 text-right">{t("col.total")}</th>
              <th className="px-3 py-2">{t("col.problems")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 300).map(({ s, st, individual, excused, issues, options }) => (
              <tr key={s.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <button type="button" className="text-left hover:underline" onClick={() => setOpenPupil(s.id)}>
                    {s.externalId && <span className="text-slate-500">{s.externalId} · </span>}
                    {s.name}
                  </button>
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">{s.homeGroup?.name ?? "—"}</td>
                <td className="px-3 py-1.5 text-xs text-slate-600">
                  {st.map((l) => (
                    <div key={l.id}>{lessonLabel(l)}</div>
                  ))}
                </td>
                <td className="px-3 py-1.5 text-xs text-slate-600">
                  {individual.map((l) => (
                    <div key={l.id}>
                      {l.supportKind} · {lessonLabel(l)}
                    </div>
                  ))}
                </td>
                <td className="px-3 py-1.5 text-xs">
                  <div className="flex flex-wrap gap-1">
                    {excused.map((l) => (
                      <span key={l.id} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-900">
                        {l.subject.name} ({l.periods})
                        <button
                          type="button"
                          aria-label={t("remove")}
                          onClick={() => setExcusals.mutate({ id: s.id, lessonIds: excused.filter((x) => x.id !== l.id).map((x) => x.id) })}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <select
                    className="mt-1 h-7 max-w-52 rounded border border-slate-200 bg-white px-1 text-xs"
                    value=""
                    onChange={(e) => e.target.value && setExcusals.mutate({ id: s.id, lessonIds: [...excused.map((x) => x.id), e.target.value] })}
                  >
                    <option value="">{t("add")}</option>
                    {options.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.subject.name} ({l.periods}) · {l.teacher?.name ?? "—"}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={cn("px-3 py-1.5 text-right font-medium", s.periods !== week ? "text-red-700" : "text-slate-700")}>{s.periods}</td>
                <td className="px-3 py-1.5 text-xs text-red-700">
                  {issues.map((i) => (
                    <div key={i.key}>{t(`issue.${i.key}`, { n: i.n ?? 0 })}</div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <StudentLessonsDialog studentId={openPupil} week={week} onClose={() => setOpenPupil(null)} />
    </div>
  );
}
