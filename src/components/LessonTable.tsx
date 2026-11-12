"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";
import { trpc } from "@/trpc/client";
import type { RouterOutputs } from "@/trpc/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LessonDialog } from "@/components/LessonDialog";
import { useErrorToast } from "@/components/useErrorToast";
import { shapeMatchesPeriods } from "@/lib/shape";
import { cn } from "@/lib/utils";

export type LessonRow = RouterOutputs["lessons"]["list"][number];

// Short description of a lesson's structure, used in tables.
export function StructureBadge({ lesson }: { lesson: Pick<LessonRow, "hostLessonId" | "supportKind" | "band" | "homeGroups" | "audience" | "hostLesson"> }) {
  const tEnum = useTranslations("enums");
  const t = useTranslations("lessonTable");
  if (lesson.supportKind && !lesson.hostLesson) {
    return <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-800">{tEnum(`supportKind.${lesson.supportKind}`)}</Badge>;
  }
  if (lesson.supportKind && lesson.hostLesson) {
    return (
      <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-800">
        {tEnum(`supportKind.${lesson.supportKind}`)} · {t("during")} {lesson.hostLesson.subject.name}
      </Badge>
    );
  }
  if (lesson.band) return <Badge variant="outline" className="bg-violet-50 border-violet-200 text-violet-800">{t("band")} {lesson.band.name}</Badge>;
  if (lesson.homeGroups.length > 1) return <Badge variant="outline" className="bg-sky-50 border-sky-200 text-sky-800">{t("merge")}</Badge>;
  return null;
}

// A table of lessons with edit/delete, shared by the lessons page, the τμήμα page and the band page.
export function LessonTable({
  lessons,
  showGroups = true,
  showStructure = true,
  compact = false,
  emptyText,
}: {
  lessons: LessonRow[];
  showGroups?: boolean;
  showStructure?: boolean;
  compact?: boolean;
  emptyText?: string;
}) {
  const t = useTranslations("lessonTable");
  const locale = useLocale();
  const toastError = useErrorToast();
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState<LessonRow | null>(null);
  const [toDelete, setToDelete] = useState<LessonRow | null>(null);
  const remove = trpc.lessons.remove.useMutation({
    onSuccess: () => Promise.all([utils.lessons.invalidate(), utils.homeGroups.invalidate(), utils.bands.invalidate(), utils.teachers.list.invalidate(), utils.stats.invalidate()]),
    onError: toastError,
  });

  if (lessons.length === 0) return <p className="text-sm text-slate-400 py-2">{emptyText ?? t("empty")}</p>;

  return (
    <>
      <table className="w-full text-sm">
        <thead className="text-slate-500 text-left">
          <tr>
            {showGroups && <th className="py-1 pr-2">{t("col.groups")}</th>}
            <th className="py-1 pr-2">{t("col.subject")}</th>
            <th className="py-1 pr-2">{t("col.teacher")}</th>
            <th className="py-1 pr-2 text-right">{t("col.periods")}</th>
            <th className="py-1 pr-2">{t("col.shape")}</th>
            <th className="py-1 pr-2 text-right">{t("col.pupils")}</th>
            {showStructure && <th className="py-1 pr-2">{t("col.structure")}</th>}
            {!compact && <th className="py-1 pr-2">{t("col.rooms")}</th>}
            {!compact && <th className="py-1 pr-2">{t("col.note")}</th>}
            <th className="w-16" />
          </tr>
        </thead>
        <tbody>
          {lessons.map((l) => (
            <tr key={l.id} className={cn("border-t border-slate-100", !l.teacherId && "bg-amber-50/70", !shapeMatchesPeriods(l.shape, l.periods) && "bg-red-50/70")}>
              {showGroups && (
                <td className="py-1 pr-2 whitespace-nowrap">
                  {l.homeGroups.map((h, i) => (
                    <span key={h.homeGroupId}>
                      {i > 0 && <span className="text-slate-400">+</span>}
                      <Link className="hover:underline" href={`/${locale}/admin/home-groups/${h.homeGroupId}`}>{h.homeGroup.name}</Link>
                    </span>
                  ))}
                </td>
              )}
              <td className="py-1 pr-2">
                {l.subject.name}
                {l.after.length > 0 && <span className="ml-1 rounded bg-violet-50 border border-violet-200 px-1 text-xs text-violet-800" title={t("orderAfter", { n: l.after.length })}>↻{l.after.length}</span>}
                {l._count.followers > 0 && <span className="ml-1 rounded bg-violet-50 border border-violet-200 px-1 text-xs text-violet-800" title={t("orderBefore", { n: l._count.followers })}>→</span>}
              </td>
              <td className={cn("py-1 pr-2", !l.teacherId && "text-amber-700 italic")}>{l.teacher?.name ?? t("vacancy")}</td>
              <td className="py-1 pr-2 text-right">{l.periods}</td>
              <td className="py-1 pr-2 text-slate-500">
                {l.shape}
                {l.crossDay && <span className="ml-1 rounded bg-indigo-50 border border-indigo-200 px-1 text-xs text-indigo-800" title={t("crossDay")}>↷</span>}
              </td>
              <td className="py-1 pr-2 text-right text-slate-500">{l.audience === "SUBSET" ? l.students.length : t("all")}</td>
              {showStructure && <td className="py-1 pr-2"><StructureBadge lesson={l} /></td>}
              {!compact && (
                <td className="py-1 pr-2 text-xs text-slate-500 whitespace-nowrap">
                  {l.roomMode === "ANY" ? (l.roomKind ?? "") : `${l.roomMode === "ONLY" ? "=" : "≈"} ${l.rooms.map((r) => r.room.name).join(", ")}`}
                  {l.sameRoom && <span className="ml-1 rounded bg-sky-50 border border-sky-200 px-1 text-sky-800" title={t("sameRoom")}>1</span>}
                </td>
              )}
              {!compact && <td className="py-1 pr-2 text-slate-400 text-xs">{l.note}</td>}
              <td className="py-1 text-right whitespace-nowrap">
                <Button size="icon-sm" variant="ghost" aria-label={t("edit")} onClick={() => setEditing(l)}>
                  <Pencil className="w-4 h-4 text-slate-400" />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={t("delete")} onClick={() => setToDelete(l)}>
                  <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-600" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <LessonDialog open={!!editing} onClose={() => setEditing(null)} lesson={editing} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && toDelete._count.supports > 0 ? t("deleteWithSupport", { n: toDelete._count.supports }) : t("deleteText")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (toDelete) await remove.mutateAsync({ id: toDelete.id, force: true });
                setToDelete(null);
              }}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
