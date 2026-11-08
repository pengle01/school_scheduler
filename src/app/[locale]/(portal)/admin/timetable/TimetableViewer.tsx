"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil, Trash2, Upload } from "lucide-react";
import { trpc } from "@/trpc/client";
import type { RouterOutputs } from "@/trpc/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { WeekGrid, DAY_KEYS, type GridCell, type GridChip } from "@/components/WeekGrid";
import { LessonDialog } from "@/components/LessonDialog";
import { useErrorToast } from "@/components/useErrorToast";
import { attendanceOf } from "@/lib/pupilPeriods";
import { DEFAULT_DAYS_PERIODS } from "@/lib/calendar";
import { cn } from "@/lib/utils";

type Lesson = RouterOutputs["lessons"]["list"][number];
type Placement = RouterOutputs["timetables"]["placements"][number];
type View = "teacher" | "student" | "homeGroup" | "room";

const slotKey = (d: number, p: number) => d * 100 + p;

export function TimetableViewer() {
  const t = useTranslations("timetable");
  const tEnum = useTranslations("enums");
  const locale = useLocale();
  const toastError = useErrorToast();
  const utils = trpc.useUtils();

  const timetables = trpc.timetables.list.useQuery();
  const lessons = trpc.lessons.list.useQuery();
  const students = trpc.students.list.useQuery();
  const teachers = trpc.teachers.list.useQuery();
  const rooms = trpc.rooms.list.useQuery();
  const homeGroups = trpc.homeGroups.list.useQuery();
  const settings = trpc.rules.settings.useQuery();
  const daysPeriods = settings.data?.daysPeriods ?? DEFAULT_DAYS_PERIODS;

  const [chosen, setChosen] = useState<string | null>(null);
  const current = timetables.data?.find((x) => x.id === chosen) ?? timetables.data?.[0] ?? null;
  const placements = trpc.timetables.placements.useQuery({ id: current?.id ?? "" }, { enabled: !!current });
  const teacherDetail = trpc.teachers.byId.useQuery({ id: "" }, { enabled: false });

  const importMut = trpc.timetables.import.useMutation({
    onSuccess: (r) => {
      toast.success(t("loaded", { n: r.placements }));
      utils.timetables.invalidate();
      setChosen(r.id);
    },
    onError: toastError,
  });
  const rename = trpc.timetables.rename.useMutation({ onSuccess: () => utils.timetables.list.invalidate(), onError: toastError });
  const remove = trpc.timetables.remove.useMutation({
    onSuccess: () => {
      utils.timetables.invalidate();
      setChosen(null);
    },
    onError: toastError,
  });
  const [toDelete, setToDelete] = useState(false);

  const [view, setView] = useState<View>("teacher");
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<Record<View, string | null>>({ teacher: null, student: null, homeGroup: null, room: null });
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ day: number; period: number } | null>(null);
  const [editing, setEditing] = useState<Lesson | null>(null);

  // ── indexes ──
  const lessonById = useMemo(() => new Map((lessons.data ?? []).map((l) => [l.id, l])), [lessons.data]);
  const roomName = useMemo(() => new Map((rooms.data ?? []).map((r) => [r.id, r.name])), [rooms.data]);
  const bySlot = useMemo(() => {
    const m = new Map<number, Placement[]>();
    for (const p of placements.data ?? []) {
      const k = slotKey(p.day, p.period);
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [placements.data]);
  const byLesson = useMemo(() => {
    const m = new Map<string, Placement[]>();
    for (const p of placements.data ?? []) m.set(p.lessonId, [...(m.get(p.lessonId) ?? []), p]);
    for (const v of m.values()) v.sort((a, b) => a.day - b.day || a.period - b.period);
    return m;
  }, [placements.data]);
  const attendance = useMemo(
    () =>
      attendanceOf(
        (students.data ?? []).map((s) => ({ id: s.id, homeGroupId: s.homeGroupId, excusedFrom: s.excusals.map((e) => e.lessonId) })),
        (lessons.data ?? []).map((l) => ({
          id: l.id,
          periods: l.periods,
          audience: l.audience,
          homeGroupIds: l.homeGroups.map((h) => h.homeGroupId),
          studentIds: l.students.map((x) => x.studentId),
          hostLessonId: l.hostLessonId,
          bandId: l.bandId,
        })),
      ),
    [students.data, lessons.data],
  );
  const bandOptions = useMemo(() => {
    const m = new Map<string, Lesson[]>();
    for (const l of lessons.data ?? []) if (l.bandId) m.set(l.bandId, [...(m.get(l.bandId) ?? []), l]);
    return m;
  }, [lessons.data]);
  const supportsOf = useMemo(() => {
    const m = new Map<string, Lesson[]>();
    for (const l of lessons.data ?? []) if (l.hostLessonId) m.set(l.hostLessonId, [...(m.get(l.hostLessonId) ?? []), l]);
    return m;
  }, [lessons.data]);

  // lessons shown for the picked entity → their placements
  const shown: Placement[] = useMemo(() => {
    const id = picked[view];
    if (!id || !placements.data) return [];
    if (view === "teacher") return placements.data.filter((p) => lessonById.get(p.lessonId)?.teacherId === id);
    if (view === "room") return placements.data.filter((p) => p.roomId === id);
    if (view === "homeGroup") return placements.data.filter((p) => lessonById.get(p.lessonId)?.homeGroups.some((h) => h.homeGroupId === id));
    const att = attendance.get(id);
    return att ? placements.data.filter((p) => att.has(p.lessonId)) : [];
  }, [picked, view, placements.data, lessonById, attendance]);

  // pupils with a clash in this timetable (two attended lessons at one slot)
  const clashingPupils = useMemo(() => {
    const out = new Map<string, number>();
    if (!placements.data) return out;
    for (const [sid, att] of attendance) {
      const seen = new Set<number>();
      let n = 0;
      for (const lid of att) for (const p of byLesson.get(lid) ?? []) {
        const k = slotKey(p.day, p.period);
        if (seen.has(k)) n++;
        seen.add(k);
      }
      if (n) out.set(sid, n);
    }
    return out;
  }, [attendance, byLesson, placements.data]);

  const unavailability = useMemo(() => {
    const m = new Map<number, "hard" | "soft">();
    if (view !== "teacher" || !picked.teacher) return m;
    return m;
  }, [view, picked.teacher]);
  const teacherSlots = trpc.teachers.byId.useQuery({ id: picked.teacher ?? "" }, { enabled: view === "teacher" && !!picked.teacher });
  void teacherDetail;
  const shade = (day: number, period: number): GridCell["shade"] => {
    if (view !== "teacher") return null;
    const u = teacherSlots.data?.unavailability.find((x) => x.day === day && x.period === period);
    return u ? (u.kind === "HARD" ? "hard" : "soft") : unavailability.get(slotKey(day, period)) ?? null;
  };

  const chipOf = (l: Lesson, p: Placement): GridChip => {
    const groups = l.homeGroups.map((h) => h.homeGroup.name).join("+");
    const teacher = l.teacher?.name ?? t("vacancy");
    return {
      id: l.id,
      title: l.subject.name,
      subtitle: view === "teacher" ? groups : view === "homeGroup" ? teacher : `${groups} · ${teacher}`,
      room: p.roomId ? roomName.get(p.roomId) : null,
      tone: l.hostLessonId ? "support" : l.bandId ? "band" : l.homeGroups.length > 1 ? "merge" : "normal",
    };
  };
  const cells = (day: number, period: number): GridCell => {
    const here = shown.filter((p) => p.day === day && p.period === period);
    const chips = here.map((p) => lessonById.get(p.lessonId)).filter((l): l is Lesson => !!l).map((l, i) => chipOf(l, here[i]));
    return { chips, clash: (view === "teacher" || view === "student") && chips.length > 1, shade: shade(day, period) };
  };

  // ── pickers ──
  const q = filter.trim().toLowerCase();
  const match = (...parts: (string | null | undefined)[]) => !q || parts.some((x) => x?.toLowerCase().includes(q));
  type Item = { id: string; label: string; sub?: string; warn?: number };
  const items: Item[] = useMemo(() => {
    if (view === "teacher") return (teachers.data ?? []).filter((x) => match(x.name, x.department)).map((x) => ({ id: x.id, label: x.name, sub: x.department ?? undefined }));
    if (view === "room") return (rooms.data ?? []).filter((x) => match(x.name, x.kind)).map((x) => ({ id: x.id, label: x.name, sub: x.kind ?? undefined }));
    if (view === "homeGroup") return (homeGroups.data ?? []).filter((x) => match(x.name)).map((x) => ({ id: x.id, label: x.name, sub: `${x.students} ${t("view.student").toLowerCase()}` }));
    return (students.data ?? [])
      .filter((x) => match(x.name, x.externalId, x.homeGroup?.name))
      .map((x) => ({ id: x.id, label: x.externalId ? `${x.externalId} · ${x.name}` : x.name, sub: `${x.homeGroup?.name ?? "—"} · ${x.periods}π`, warn: clashingPupils.get(x.id) }))
      .sort((a, b) => (b.warn ?? 0) - (a.warn ?? 0) || a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, q, teachers.data, rooms.data, homeGroups.data, students.data, clashingPupils]);

  const selected = selectedLesson ? lessonById.get(selectedLesson) : null;
  const pickedLabel = items.find((x) => x.id === picked[view])?.label ?? (picked[view] ? pickedName(picked[view]!) : null);
  function pickedName(id: string) {
    return teachers.data?.find((x) => x.id === id)?.name ?? students.data?.find((x) => x.id === id)?.name ?? homeGroups.data?.find((x) => x.id === id)?.name ?? rooms.data?.find((x) => x.id === id)?.name ?? "";
  }

  if (timetables.isLoading) return <p className="text-slate-500 text-sm">…</p>;

  return (
    <div className="space-y-4">
      {/* ── timetable chooser ── */}
      <div className="flex flex-wrap items-center gap-2">
        {(timetables.data ?? []).length > 0 && (
          <select className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" value={current?.id ?? ""} onChange={(e) => setChosen(e.target.value)}>
            {timetables.data!.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        )}
        {current && (
          <>
            <Badge variant="outline">{current.status}</Badge>
            {Object.entries(current.summary.penalties).map(([k, v]) => (
              <Badge key={k} variant="outline" className={cn(k === "S1" && v > 0 && "border-red-300 bg-red-50 text-red-800")}>
                {k} {v}
              </Badge>
            ))}
            <span className="text-xs text-slate-500">
              {t("periods", { n: current.placements })}
              {current.solvedAt ? ` · ${t("solvedAt")} ${new Date(current.solvedAt).toLocaleString(locale)}` : ""}
            </span>
            <Button size="icon-sm" variant="ghost" aria-label={t("rename")} onClick={() => { const n = prompt(t("rename"), current.name); if (n?.trim()) rename.mutate({ id: current.id, name: n.trim() }); }}>
              <Pencil className="w-4 h-4 text-slate-400" />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label={t("delete")} onClick={() => setToDelete(true)}>
              <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-600" />
            </Button>
          </>
        )}
        <label className="ml-auto inline-flex items-center gap-2 text-sm cursor-pointer rounded-md border border-slate-200 bg-white px-3 h-9 hover:bg-slate-50" title={t("loadHint")}>
          <Upload className="w-4 h-4" /> {t("load")}
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              importMut.mutate({ name: f.name.replace(/\.json$/i, ""), text: await f.text() });
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {current && (current.summary.unresolvedPupils.length > 0 || current.summary.contradictoryPupils.length > 0 || current.summary.problems.length > 0) && (
        <div className="text-xs space-y-1">
          {current.summary.unresolvedPupils.length > 0 && (
            <div className="text-red-700">
              <b>{t("unresolved")}:</b> {current.summary.unresolvedPupils.join(", ")}
            </div>
          )}
          {current.summary.contradictoryPupils.length > 0 && (
            <div className="text-amber-700">
              <b>{t("contradictory")}:</b> {current.summary.contradictoryPupils.join(", ")}
            </div>
          )}
          {current.summary.problems.length > 0 && <div className="text-amber-700">{t("problems", { n: current.summary.problems.length })}</div>}
        </div>
      )}

      {!current ? (
        <p className="text-sm text-slate-500">{t("empty")}</p>
      ) : (
        <div className="grid lg:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_340px] gap-4 items-start">
          {/* ── picker ── */}
          <div className="space-y-2">
            <Tabs value={view} onValueChange={(v) => { setView(v as View); setFilter(""); }}>
              <TabsList className="w-full grid grid-cols-4">
                {(["teacher", "student", "homeGroup", "room"] as View[]).map((v) => (
                  <TabsTrigger key={v} value={v} className="text-xs px-1">
                    {t(`view.${v}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t(`pick.${view}`)} className="h-8 text-sm" />
            <div className="max-h-[70vh] overflow-auto rounded-md border border-slate-200 bg-white divide-y divide-slate-100">
              {items.slice(0, 400).map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => { setPicked({ ...picked, [view]: it.id }); setSelectedLesson(null); setSelectedSlot(null); }}
                  className={cn("w-full text-left px-2.5 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-2", picked[view] === it.id && "bg-emerald-50 text-emerald-900")}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{it.label}</span>
                    {it.sub && <span className="block text-xs text-slate-400 truncate">{it.sub}</span>}
                  </span>
                  {it.warn ? <span className="text-[10px] rounded-full bg-red-100 text-red-700 px-1.5 py-0.5 shrink-0">{t("clashes", { n: it.warn })}</span> : null}
                </button>
              ))}
            </div>
          </div>

          {/* ── grid ── */}
          <div className="min-w-0">
            {!picked[view] ? (
              <p className="text-sm text-slate-500 py-8 text-center">{t("pickOne")}</p>
            ) : (
              <>
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="font-semibold text-slate-800">{pickedLabel}</h3>
                  <span className="text-xs text-slate-500">{t("total", { n: shown.length })}</span>
                </div>
                {placements.isLoading ? (
                  <p className="text-sm text-slate-500">…</p>
                ) : shown.length === 0 ? (
                  <p className="text-sm text-slate-500">{t("noPeriods")}</p>
                ) : (
                  <WeekGrid
                    daysPeriods={daysPeriods}
                    cells={cells}
                    selected={selectedLesson}
                    highlight={selectedSlot}
                    onChip={(id, day, period) => { setSelectedLesson(id); setSelectedSlot({ day, period }); }}
                  />
                )}
              </>
            )}
          </div>

          {/* ── detail panel ── */}
          <div className="xl:sticky xl:top-4">
            {selected && selectedSlot && (
              <LessonPanel
                lesson={selected}
                slot={selectedSlot}
                lessonById={lessonById}
                bySlot={bySlot}
                byLesson={byLesson}
                bandOptions={bandOptions}
                supportsOf={supportsOf}
                roomName={roomName}
                tEnum={tEnum}
                locale={locale}
                onSelect={(id, slot) => { setSelectedLesson(id); if (slot) setSelectedSlot(slot); }}
                onEdit={() => setEditing(selected)}
                onClose={() => { setSelectedLesson(null); setSelectedSlot(null); }}
              />
            )}
          </div>
        </div>
      )}

      <LessonDialog open={!!editing} onClose={() => setEditing(null)} lesson={editing} />

      <AlertDialog open={toDelete} onOpenChange={setToDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteText")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (current) remove.mutate({ id: current.id }); setToDelete(false); }}>{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── the right-hand panel: the lesson, its band / host / supports at this slot, its periods ──
function LessonPanel({
  lesson,
  slot,
  lessonById,
  bySlot,
  byLesson,
  bandOptions,
  supportsOf,
  roomName,
  tEnum,
  locale,
  onSelect,
  onEdit,
  onClose,
}: {
  lesson: Lesson;
  slot: { day: number; period: number };
  lessonById: Map<string, Lesson>;
  bySlot: Map<number, Placement[]>;
  byLesson: Map<string, Placement[]>;
  bandOptions: Map<string, Lesson[]>;
  supportsOf: Map<string, Lesson[]>;
  roomName: Map<string, string>;
  tEnum: ReturnType<typeof useTranslations>;
  locale: string;
  onSelect: (lessonId: string, slot?: { day: number; period: number }) => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("timetable.panel");
  const tDays = useTranslations("days");
  const tt = useTranslations("timetable");
  const here = bySlot.get(slotKey(slot.day, slot.period)) ?? [];
  const roomAt = (id: string) => {
    const p = here.find((x) => x.lessonId === id);
    return p?.roomId ? roomName.get(p.roomId) ?? null : null;
  };
  const host = lesson.hostLessonId ? lessonById.get(lesson.hostLessonId) : null;
  const options = lesson.bandId ? (bandOptions.get(lesson.bandId) ?? []).filter((o) => o.id !== lesson.id) : [];
  const siblings = host ? (supportsOf.get(host.id) ?? []).filter((s) => s.id !== lesson.id && here.some((p) => p.lessonId === s.id)) : [];
  const mySupports = (supportsOf.get(lesson.id) ?? []).filter((s) => here.some((p) => p.lessonId === s.id));
  const dayName = (d: number) => tDays(DAY_KEYS[d - 1]);
  const row = (l: Lesson, extra?: string) => (
    <button key={l.id} type="button" onClick={() => onSelect(l.id)} className="w-full text-left rounded border border-slate-200 bg-white px-2 py-1 hover:border-emerald-400 text-xs">
      <div className="font-medium text-slate-800">
        {l.subject.name} <span className="text-slate-400">·</span> {l.homeGroups.map((h) => h.homeGroup.name).join("+")}
      </div>
      <div className="text-slate-500">
        {l.teacher?.name ?? tt("vacancy")} · {l.audience === "SUBSET" ? `${l.students.length} ${tt("view.student").toLowerCase()}` : t("allPupils")}
        {roomAt(l.id) ? ` · @${roomAt(l.id)}` : ""}
        {extra ? ` · ${extra}` : ""}
      </div>
    </button>
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm space-y-3 max-h-[80vh] overflow-auto">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-slate-500">
            {t("title")} · {dayName(slot.day)} {tt("period").toLowerCase()} {slot.period}
          </div>
          <div className="font-semibold text-slate-800">{lesson.subject.name}</div>
          <div className="text-slate-600">{lesson.homeGroups.map((h) => h.homeGroup.name).join(" + ")}</div>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none" aria-label="×">
          ×
        </button>
      </div>

      <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-xs">
        <dt className="text-slate-500">{t("teacher")}</dt>
        <dd>{lesson.teacher ? <Link className="hover:underline" href={`/${locale}/admin/teachers/${lesson.teacher.id}`}>{lesson.teacher.name}</Link> : <i>{tt("vacancy")}</i>}</dd>
        <dt className="text-slate-500">{t("homeGroups")}</dt>
        <dd className="flex flex-wrap gap-1">
          {lesson.homeGroups.map((h) => (
            <Link key={h.homeGroupId} className="hover:underline" href={`/${locale}/admin/home-groups/${h.homeGroupId}`}>
              {h.homeGroup.name}
            </Link>
          ))}
        </dd>
        <dt className="text-slate-500">{t("periods")}</dt>
        <dd>
          {lesson.periods} · {t("shape").toLowerCase()} {lesson.shape || "1".repeat(lesson.periods).split("").join("+")}
        </dd>
        <dt className="text-slate-500">{t("room")}</dt>
        <dd>
          {roomAt(lesson.id) ?? <i>{t("noRoom")}</i>}
          {lesson.roomMode !== "ANY" && lesson.rooms.length > 0 && (
            <span className="text-slate-400"> ({t("roomPref").toLowerCase()}: {lesson.roomMode === "ONLY" ? "= " : "≈ "}{lesson.rooms.map((r) => r.room.name).join(", ")})</span>
          )}
        </dd>
        <dt className="text-slate-500">{t("pupils")}</dt>
        <dd>{lesson.audience === "SUBSET" ? lesson.students.length : t("allPupils")}</dd>
      </dl>

      {lesson.band && (
        <div className="rounded-md border border-violet-200 bg-violet-50/60 p-2 space-y-1.5">
          <div className="font-medium text-violet-900 text-xs">
            {t("band", { name: lesson.band.name })} · {tEnum(`bandKind.${lesson.band.kind}`)}
          </div>
          <div className="text-xs text-violet-800">{t("bandText")}</div>
          {options.map((o) => row(o))}
        </div>
      )}

      {host && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2 space-y-1.5">
          <div className="font-medium text-amber-900 text-xs">{t("supportOf", { kind: lesson.supportKind ? tEnum(`supportKind.${lesson.supportKind}`) : "" })}</div>
          {row(host)}
          {siblings.length > 0 && (
            <>
              <div className="text-xs text-amber-800 pt-1">{t("otherSupports")}</div>
              {siblings.map((s) => row(s, s.supportKind ? tEnum(`supportKind.${s.supportKind}`) : undefined))}
            </>
          )}
        </div>
      )}

      {mySupports.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2 space-y-1.5">
          <div className="font-medium text-amber-900 text-xs">{t("supports")}</div>
          {mySupports.map((s) => row(s, s.supportKind ? tEnum(`supportKind.${s.supportKind}`) : undefined))}
        </div>
      )}

      <div>
        <div className="text-xs text-slate-500 mb-1">{t("slots")}</div>
        <div className="flex flex-wrap gap-1">
          {(byLesson.get(lesson.id) ?? []).map((p) => (
            <button
              key={`${p.day}-${p.period}`}
              type="button"
              onClick={() => onSelect(lesson.id, { day: p.day, period: p.period })}
              className={cn(
                "rounded border px-1.5 py-0.5 text-xs",
                p.day === slot.day && p.period === slot.period ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white hover:border-emerald-400",
              )}
            >
              {dayName(p.day)} {p.period}
              {p.roomId ? <span className="text-slate-400"> @{roomName.get(p.roomId)}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <Button size="sm" variant="outline" onClick={onEdit}>
        <Pencil className="w-3.5 h-3.5 mr-1" /> {t("edit")}
      </Button>
    </div>
  );
}
