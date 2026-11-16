"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Pencil, Trash2, X } from "lucide-react";
import { trpc } from "@/trpc/client";
import type { RouterOutputs } from "@/trpc/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SUPPORT_TONE } from "@/lib/supportTone";
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
import { useColumnWidths } from "@/components/useColumnWidths";
import type { ColumnFilters, FilterColumn } from "@/lib/lessonFilter";
import { shapeMatchesPeriods } from "@/lib/shape";
import { cn } from "@/lib/utils";

export type LessonRow = RouterOutputs["lessons"]["list"][number];

// Short description of a lesson's structure, used in tables.
export function StructureBadge({ lesson }: { lesson: Pick<LessonRow, "hostLessonId" | "supportKind" | "band" | "homeGroups" | "audience" | "hostLesson"> }) {
  const tEnum = useTranslations("enums");
  const t = useTranslations("lessonTable");
  if (lesson.supportKind && !lesson.hostLesson) {
    return <Badge variant="outline" className={SUPPORT_TONE[lesson.supportKind].badge}>{tEnum(`supportKind.${lesson.supportKind}`)}</Badge>;
  }
  if (lesson.supportKind && lesson.hostLesson) {
    return (
      <Badge variant="outline" className={SUPPORT_TONE[lesson.supportKind].badge}>
        {tEnum(`supportKind.${lesson.supportKind}`)} · {t("during")} {lesson.hostLesson.subject.name}
      </Badge>
    );
  }
  if (lesson.band) return <Badge variant="outline" className="bg-violet-50 border-violet-200 text-violet-800">{t("band")} {lesson.band.name}</Badge>;
  if (lesson.homeGroups.length > 1) return <Badge variant="outline" className="bg-sky-50 border-sky-200 text-sky-800">{t("merge")}</Badge>;
  return null;
}

// Default widths (px) of the adjustable columns; they add up to about 1100.
const COLUMN_WIDTHS = { num: 36, groups: 110, subject: 210, teacher: 140, periods: 56, shape: 72, pupils: 60, structure: 140, rooms: 130, note: 70, actions: 72 };
type ColumnId = keyof typeof COLUMN_WIDTHS;

// A header cell; with onResize it gets a drag handle on its right edge (double-click = default width).
function Th({ width, onResize, className, children }: { width?: number; onResize?: (px: number | null) => void; className?: string; children?: React.ReactNode }) {
  return (
    <th className={cn("py-1 pr-2", onResize && "relative", className)}>
      {children}
      {onResize && width !== undefined && (
        <span
          role="separator"
          aria-orientation="vertical"
          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none border-r border-slate-200 hover:bg-emerald-400/60"
          onDoubleClick={() => onResize(null)}
          onPointerDown={(e) => {
            e.preventDefault();
            const el = e.currentTarget;
            const startX = e.clientX;
            el.setPointerCapture(e.pointerId);
            const move = (ev: PointerEvent) => onResize(width + ev.clientX - startX);
            const up = () => {
              el.removeEventListener("pointermove", move);
              el.removeEventListener("pointerup", up);
              el.removeEventListener("pointercancel", up);
            };
            el.addEventListener("pointermove", move);
            el.addEventListener("pointerup", up);
            el.addEventListener("pointercancel", up);
          }}
        />
      )}
    </th>
  );
}

// A table of lessons with edit/delete, shared by the lessons page, the τμήμα page and the band page.
export function LessonTable({
  lessons,
  showGroups = true,
  showStructure = true,
  compact = false,
  numbered = false,
  widthsKey,
  filters,
  onFilter,
  emptyText,
}: {
  lessons: LessonRow[];
  showGroups?: boolean;
  showStructure?: boolean;
  compact?: boolean;
  numbered?: boolean; // a leading column with the row's position in the list
  widthsKey?: string; // set: the columns can be dragged wider/narrower, remembered under this name
  // set both: a row of filter boxes under the headers; the caller filters the lessons (src/lib/lessonFilter.ts)
  filters?: ColumnFilters;
  onFilter?: (next: ColumnFilters) => void;
  emptyText?: string;
}) {
  const { widths, setWidth } = useColumnWidths<ColumnId>(widthsKey, COLUMN_WIDTHS);
  const resizable = !!widthsKey;
  const columns: ColumnId[] = [
    ...(numbered ? (["num"] as const) : []),
    ...(showGroups ? (["groups"] as const) : []),
    "subject",
    "teacher",
    "periods",
    "shape",
    "pupils",
    ...(showStructure ? (["structure"] as const) : []),
    ...(!compact ? (["rooms", "note"] as const) : []),
    "actions",
  ];
  const th = (id: ColumnId) => (resizable ? { width: widths[id], onResize: (px: number | null) => setWidth(id, px) } : {});
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

  const filtering = !!(filters && onFilter);
  const filterCell = (id: FilterColumn, numeric = false) => (
    <th className="pb-1 pr-2 font-normal">
      <input
        value={filters?.[id] ?? ""}
        onChange={(e) => onFilter?.({ ...filters, [id]: e.target.value })}
        aria-label={`${t("filterColumn")}: ${t(`col.${id}`)}`}
        title={numeric ? t("numberFilterHint") : undefined}
        className={cn("h-6 w-full min-w-0 rounded border border-slate-200 bg-white px-1 text-xs text-slate-800 focus:outline-none focus:border-emerald-500", filters?.[id]?.trim() && "border-emerald-500 bg-emerald-50")}
      />
    </th>
  );

  if (lessons.length === 0 && !filtering) return <p className="text-sm text-slate-400 py-2">{emptyText ?? t("empty")}</p>;

  return (
    <>
      <table
        className={cn("text-sm", resizable ? "table-fixed [&_td]:overflow-hidden [&_td]:text-ellipsis [&_th]:overflow-hidden [&_th]:text-ellipsis [&_th]:whitespace-nowrap" : "w-full")}
        style={resizable ? { width: columns.reduce((sum, id) => sum + widths[id], 0) } : undefined}
      >
        {resizable && (
          <colgroup>
            {columns.map((id) => (
              <col key={id} style={{ width: widths[id] }} />
            ))}
          </colgroup>
        )}
        <thead className="text-slate-500 text-left">
          <tr>
            {numbered && <Th {...th("num")} className={cn("text-right", !resizable && "w-10")}>#</Th>}
            {showGroups && <Th {...th("groups")}>{t("col.groups")}</Th>}
            <Th {...th("subject")}>{t("col.subject")}</Th>
            <Th {...th("teacher")}>{t("col.teacher")}</Th>
            <Th {...th("periods")} className="text-right">{t("col.periods")}</Th>
            <Th {...th("shape")}>{t("col.shape")}</Th>
            <Th {...th("pupils")} className="text-right">{t("col.pupils")}</Th>
            {showStructure && <Th {...th("structure")}>{t("col.structure")}</Th>}
            {!compact && <Th {...th("rooms")}>{t("col.rooms")}</Th>}
            {!compact && <Th {...th("note")}>{t("col.note")}</Th>}
            <th className={resizable ? undefined : "w-16"} />
          </tr>
          {filtering && (
            <tr>
              {numbered && <th />}
              {showGroups && filterCell("groups")}
              {filterCell("subject")}
              {filterCell("teacher")}
              {filterCell("periods", true)}
              {filterCell("shape")}
              {filterCell("pupils", true)}
              {showStructure && filterCell("structure")}
              {!compact && filterCell("rooms")}
              {!compact && filterCell("note")}
              <th className="pb-1 text-right">
                {Object.values(filters ?? {}).some((v) => v?.trim()) && (
                  <Button size="icon-sm" variant="ghost" aria-label={t("clearFilters")} title={t("clearFilters")} onClick={() => onFilter?.({})}>
                    <X className="w-4 h-4 text-slate-500" />
                  </Button>
                )}
              </th>
            </tr>
          )}
        </thead>
        <tbody>
          {lessons.map((l, index) => (
            <tr key={l.id} className={cn("border-t border-slate-100", l.supportKind && SUPPORT_TONE[l.supportKind].row, !l.teacherId && "bg-amber-50/70", !shapeMatchesPeriods(l.shape, l.periods) && "bg-red-50/70")}>
              {numbered && <td className="py-1 pr-2 text-right text-xs text-slate-400 tabular-nums">{index + 1}</td>}
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
                <td className="py-1 pr-2 text-xs text-slate-500 whitespace-nowrap" title={resizable ? l.rooms.map((r) => r.room.name).join(", ") : undefined}>
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
          {lessons.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="py-2 text-sm text-slate-400">{emptyText ?? t("empty")}</td>
            </tr>
          )}
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
