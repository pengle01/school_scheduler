"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LessonTable } from "@/components/LessonTable";
import { LessonDialog } from "@/components/LessonDialog";
import { cn } from "@/lib/utils";
import { useErrorToast } from "@/components/useErrorToast";
import { toast } from "sonner";

type Filter = "ALL" | "PLAIN" | "MERGE" | "SUPPORT" | "BAND" | "VACANCY";
const FILTERS: Filter[] = ["ALL", "PLAIN", "MERGE", "SUPPORT", "BAND", "VACANCY"];
const PAGE = 100;

export function LessonsTable() {
  const t = useTranslations("lessons");
  const list = trpc.lessons.list.useQuery();
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const toastError = useErrorToast();
  const utils = trpc.useUtils();
  const setSameRoom = trpc.lessons.setSameRoom.useMutation({
    onSuccess: (r) => {
      toast.success(t("sameRoomDone", { n: r.count }));
      utils.lessons.invalidate();
    },
    onError: toastError,
  });

  const rows = useMemo(() => {
    const f = text.trim().toLowerCase();
    return (list.data ?? []).filter((l) => {
      if (filter === "PLAIN" && (l.homeGroups.length !== 1 || l.supportKind || l.bandId)) return false;
      if (filter === "MERGE" && (l.homeGroups.length < 2 || l.supportKind || l.bandId)) return false;
      if (filter === "SUPPORT" && !l.supportKind) return false;
      if (filter === "BAND" && !l.bandId) return false;
      if (filter === "VACANCY" && l.teacherId) return false;
      if (!f) return true;
      const hay = `${l.homeGroups.map((h) => h.homeGroup.name).join(" ")} ${l.subject.name} ${l.teacher?.name ?? ""} ${l.band?.name ?? ""} ${l.note ?? ""}`.toLowerCase();
      return hay.includes(f);
    });
  }, [list.data, text, filter]);

  if (list.isLoading) return <p className="text-slate-500 text-sm">…</p>;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const p = Math.min(page, pages - 1);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder={t("filter")} value={text} onChange={(e) => { setText(e.target.value); setPage(0); }} className="h-9 max-w-xs" />
        <div className="flex gap-1 rounded-md border border-slate-200 p-0.5">
          {FILTERS.map((f) => (
            <button key={f} type="button" onClick={() => { setFilter(f); setPage(0); }} className={cn("px-2 py-1 rounded text-xs", filter === f ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100")}>
              {t(`kind.${f}`)}
            </button>
          ))}
        </div>
        <span className="text-sm text-slate-500">{t("count", { shown: rows.length, total: list.data?.length ?? 0 })}</span>
        {(text.trim() || filter !== "ALL") && rows.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-600 rounded-md border border-slate-200 px-2 py-1" title={t("sameRoomHint")}>
            {t("sameRoomShown")}
            <Button size="xs" variant="ghost" disabled={setSameRoom.isPending} onClick={() => setSameRoom.mutate({ ids: rows.map((l) => l.id), value: true })}>{t("yes")}</Button>
            <Button size="xs" variant="ghost" disabled={setSameRoom.isPending} onClick={() => setSameRoom.mutate({ ids: rows.map((l) => l.id), value: false })}>{t("no")}</Button>
          </span>
        )}
        {pages > 1 && (
          <span className="text-sm text-slate-600">
            <Button size="xs" variant="ghost" disabled={p === 0} onClick={() => setPage(p - 1)}>‹</Button> {p + 1}/{pages}{" "}
            <Button size="xs" variant="ghost" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>›</Button>
          </span>
        )}
        <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
          <Plus className="w-4 h-4" /> {t("add")}
        </Button>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-2 overflow-x-auto [&_table]:min-w-[1100px]">
        <LessonTable lessons={rows.slice(p * PAGE, (p + 1) * PAGE)} />
      </div>
      <LessonDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
