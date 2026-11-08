"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";
import type { RouterOutputs } from "@/trpc/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StudentPicker } from "@/components/StudentPicker";
import { useErrorToast } from "@/components/useErrorToast";
import { normaliseShape, defaultShape } from "@/lib/shape";
import { parseFixedSlots, formatFixedSlots } from "@/lib/fixedSlots";
import { cn } from "@/lib/utils";

type Lesson = RouterOutputs["lessons"]["list"][number];
type SupportKind = "ST" | "EXST" | "AST";
type Structure = "PLAIN" | "SUPPORT" | "BAND";

export interface LessonDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  // Editing an existing lesson
  lesson?: Lesson | null;
  // Defaults for a new lesson
  defaults?: {
    homeGroupIds?: string[];
    hostLessonId?: string;
    supportKind?: SupportKind;
    bandId?: string;
  };
  // Lock the structure choice (e.g. opened from a band page or a host's support table)
  lockStructure?: boolean;
}

export function LessonDialog({ open, onClose, onSaved, lesson, defaults, lockStructure }: LessonDialogProps) {
  const t = useTranslations("lessonForm");
  const tEnum = useTranslations("enums");
  const toastError = useErrorToast();
  const utils = trpc.useUtils();
  const options = trpc.lessons.options.useQuery(undefined, { enabled: open });
  const roomOptions = trpc.lessons.roomOptions.useQuery(undefined, { enabled: open });
  const students = trpc.students.list.useQuery(undefined, { enabled: open });

  const initial = useMemo(() => {
    if (lesson) {
      return {
        homeGroupIds: lesson.homeGroups.map((h) => h.homeGroupId),
        subjectId: lesson.subjectId,
        teacherId: lesson.teacherId ?? "",
        periods: lesson.periods,
        shape: lesson.shape,
        audience: lesson.audience,
        studentIds: new Set(lesson.students.map((s) => s.studentId)),
        structure: (lesson.supportKind ? "SUPPORT" : lesson.bandId ? "BAND" : "PLAIN") as Structure,
        hostLessonId: lesson.hostLessonId ?? "",
        supportKind: (lesson.supportKind ?? "ST") as SupportKind,
        bandId: lesson.bandId ?? "",
        long: lesson.long,
        roomMode: lesson.roomMode as "ANY" | "PREFER" | "ONLY",
        roomKind: lesson.roomKind ?? "",
        sameRoom: lesson.sameRoom,
        roomIds: lesson.rooms.map((r) => r.roomId),
        fixedSlots: formatFixedSlots(lesson.fixedSlots as { day: number; periods: number[] }[] | null),
        note: lesson.note ?? "",
      };
    }
    return {
      homeGroupIds: defaults?.homeGroupIds ?? [],
      subjectId: "",
      teacherId: "",
      periods: 2,
      shape: "",
      audience: defaults?.hostLessonId ? "SUBSET" : ("ALL" as "ALL" | "SUBSET"),
      studentIds: new Set<string>(),
      structure: (defaults?.hostLessonId ? "SUPPORT" : defaults?.bandId ? "BAND" : "PLAIN") as Structure,
      hostLessonId: defaults?.hostLessonId ?? "",
      supportKind: defaults?.supportKind ?? ("ST" as SupportKind),
      bandId: defaults?.bandId ?? "",
      long: false,
      roomMode: "ANY" as "ANY" | "PREFER" | "ONLY",
      roomKind: "",
      sameRoom: false,
      roomIds: [] as string[],
      fixedSlots: "",
      note: "",
    };
  }, [lesson, defaults]);

  const [form, setForm] = useState(initial);
  const [synced, setSynced] = useState(initial);
  if (initial !== synced) {
    setSynced(initial);
    setForm(initial);
  }
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const hosts = trpc.lessons.hostCandidates.useQuery({ homeGroupIds: form.homeGroupIds }, { enabled: open && form.structure === "SUPPORT" && form.homeGroupIds.length > 0 });
  const host = hosts.data?.find((h) => h.id === form.hostLessonId);
  const hostPupils = new Set(host?.audience === "SUBSET" ? host.students.map((s) => s.studentId) : []);

  const invalidateAll = () => Promise.all([utils.lessons.invalidate(), utils.homeGroups.invalidate(), utils.bands.invalidate(), utils.teachers.list.invalidate(), utils.stats.invalidate()]);
  const create = trpc.lessons.create.useMutation({ onError: toastError });
  const update = trpc.lessons.update.useMutation({ onError: toastError });

  if (!open) return null;
  const o = options.data;
  const hgSet = new Set(form.homeGroupIds);
  const pupils = (students.data ?? [])
    .filter((s) => s.homeGroupId && hgSet.has(s.homeGroupId))
    .map((s) => ({ id: s.id, name: s.name, homeGroupId: s.homeGroupId, homeGroupName: s.homeGroup?.name }));
  const shapeOk = form.shape.trim() === "" || normaliseShape(form.shape, form.periods) !== null;
  const canSave =
    form.homeGroupIds.length > 0 &&
    form.subjectId &&
    form.periods >= 1 &&
    shapeOk &&
    (form.structure !== "SUPPORT" || form.supportKind !== "ST" || form.hostLessonId) &&
    (form.structure !== "BAND" || form.bandId) &&
    (form.roomMode !== "ONLY" || form.roomIds.length > 0);

  const save = async () => {
    const fixed = form.fixedSlots.trim() ? parseFixedSlots(form.fixedSlots) : null;
    if (form.fixedSlots.trim() && !fixed) {
      toast.error(t("badFixedSlots"));
      return;
    }
    const payload = {
      subjectId: form.subjectId,
      teacherId: form.teacherId || null,
      homeGroupIds: form.homeGroupIds,
      periods: form.periods,
      shape: form.shape.trim() || defaultShape(form.periods),
      audience: form.audience,
      studentIds: form.audience === "SUBSET" ? [...form.studentIds] : [],
      hostLessonId: form.structure === "SUPPORT" && form.supportKind === "ST" ? form.hostLessonId : null,
      supportKind: form.structure === "SUPPORT" ? form.supportKind : null,
      bandId: form.structure === "BAND" ? form.bandId : null,
      long: form.long,
      roomMode: form.roomMode,
      roomKind: form.roomKind || null,
      sameRoom: form.sameRoom,
      roomIds: form.roomMode === "ANY" ? [] : form.roomIds,
      fixedSlots: fixed,
      note: form.note.trim() || null,
    };
    try {
      if (lesson) await update.mutateAsync({ id: lesson.id, ...payload });
      else await create.mutateAsync(payload);
      await invalidateAll();
      onSaved?.();
      onClose();
    } catch {
      /* toast shown by onError */
    }
  };

  const subjectLabel = (s: { name: string; level: string }) => (s.level === "NONE" ? s.name : `${s.name} (${tEnum(`level.${s.level}`)})`);
  const hostLabel = (h: NonNullable<typeof hosts.data>[number]) => `${h.homeGroups.map((x) => x.homeGroup.name).join("+")} · ${h.subject.name} · ${h.teacher?.name ?? "—"} (${h.periods})`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[96vw] sm:max-w-[1200px] max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lesson ? t("editTitle") : t("newTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {!o || !students.data ? (
          <p className="text-sm text-slate-500">…</p>
        ) : (
          <div className="space-y-4">
            {/* Structure */}
            {!lockStructure && (
              <div className="flex gap-1 rounded-md border border-slate-200 p-1 w-fit">
                {(["PLAIN", "SUPPORT", "BAND"] as Structure[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set("structure", s)}
                    className={cn("px-3 py-1 rounded text-sm", form.structure === s ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100")}
                  >
                    {t(`structure.${s}`)}
                  </button>
                ))}
              </div>
            )}

            {/* Home groups */}
            <div>
              <Label>{t("homeGroups")}</Label>
              <div className="flex flex-wrap gap-1.5 mt-1 max-h-56 overflow-auto">
                {o.homeGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    disabled={form.structure === "SUPPORT" && !!lesson}
                    onClick={() => set("homeGroupIds", hgSet.has(g.id) ? form.homeGroupIds.filter((x) => x !== g.id) : [...form.homeGroupIds, g.id])}
                    className={cn("px-2 py-0.5 rounded-full text-xs border", hgSet.has(g.id) ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
              {form.homeGroupIds.length > 1 && form.structure === "PLAIN" && <p className="text-xs text-slate-500 mt-1">{t("mergeHint")}</p>}
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>{t("subject")}</Label>
                <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm mt-1" value={form.subjectId} onChange={(e) => set("subjectId", e.target.value)}>
                  <option value="">—</option>
                  {o.subjects.map((s) => (
                    <option key={s.id} value={s.id}>{subjectLabel(s)}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t("teacher")}</Label>
                <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm mt-1" value={form.teacherId} onChange={(e) => set("teacherId", e.target.value)}>
                  <option value="">{t("vacancy")}</option>
                  {o.teachers.map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("periods")}</Label>
                  <Input type="number" min={1} max={40} className="h-9 mt-1" value={form.periods} onChange={(e) => set("periods", Number(e.target.value))} />
                </div>
                <div>
                  <Label>{t("shape")}</Label>
                  <Input className={cn("h-9 mt-1", !shapeOk && "border-red-400")} placeholder={defaultShape(form.periods)} value={form.shape} onChange={(e) => set("shape", e.target.value)} />
                </div>
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" className="accent-emerald-600" checked={form.long} onChange={(e) => set("long", e.target.checked)} /> {t("long")}
              </label>
            </div>

            {/* Rooms */}
            <div className="rounded-md border border-slate-200 p-3 space-y-2">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>{t("roomMode")}</Label>
                  <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm mt-1" value={form.roomMode} onChange={(e) => set("roomMode", e.target.value as "ANY" | "PREFER" | "ONLY")}>
                    {(["ANY", "PREFER", "ONLY"] as const).map((m) => (
                      <option key={m} value={m}>{tEnum(`roomMode.${m}`)}</option>
                    ))}
                  </select>
                </div>
                {form.roomMode !== "ONLY" && (
                  <div>
                    <Label>{t("roomKind")}</Label>
                    <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm mt-1" value={form.roomKind} onChange={(e) => set("roomKind", e.target.value)}>
                      <option value="">{t("anyKind")}</option>
                      {(roomOptions.data?.kinds ?? []).map((k) => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {form.roomMode !== "ANY" && (
                <div>
                  <Label>{t("roomList")}</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1 max-h-40 overflow-auto">
                    {(roomOptions.data?.rooms ?? []).map((r) => {
                      const idx = form.roomIds.indexOf(r.id);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          title={[r.kind, r.capacity ? `${r.capacity} θ.` : ""].filter(Boolean).join(" · ")}
                          onClick={() => set("roomIds", idx >= 0 ? form.roomIds.filter((x) => x !== r.id) : [...form.roomIds, r.id])}
                          className={cn("px-2 py-0.5 rounded-full text-xs border", idx >= 0 ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}
                        >
                          {idx >= 0 && <span className="opacity-70 mr-1">{idx + 1}.</span>}
                          {r.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-emerald-600" checked={form.sameRoom} onChange={(e) => set("sameRoom", e.target.checked)} /> {t("sameRoom")}
              </label>
              <p className="text-xs text-slate-500">{t("roomHint")}</p>
            </div>

            {form.structure === "SUPPORT" && (
              <div className="grid md:grid-cols-[160px_1fr] gap-3 rounded-md border border-amber-200 bg-amber-50/50 p-3">
                <div>
                  <Label>{t("supportKind")}</Label>
                  <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm mt-1" value={form.supportKind} onChange={(e) => set("supportKind", e.target.value as SupportKind)}>
                    {(["ST", "EXST", "AST"] as const).map((k) => (
                      <option key={k} value={k}>{tEnum(`supportKind.${k}`)}</option>
                    ))}
                  </select>
                </div>
                {form.supportKind !== "ST" ? (
                  <p className="text-xs text-slate-500 self-center">{t("excusedHint")}</p>
                ) : (
                <div>
                  <Label>{t("during")}</Label>
                  <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm mt-1" value={form.hostLessonId} onChange={(e) => set("hostLessonId", e.target.value)}>
                    <option value="">—</option>
                    {(hosts.data ?? []).map((h) => (
                      <option key={h.id} value={h.id}>{hostLabel(h)}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">{t("duringHint")}</p>
                </div>
                )}
              </div>
            )}

            {form.structure === "BAND" && (
              <div>
                <Label>{t("band")}</Label>
                <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm mt-1" value={form.bandId} onChange={(e) => set("bandId", e.target.value)}>
                  <option value="">—</option>
                  {o.bands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({tEnum(`bandKind.${b.kind}`)})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Audience */}
            <div>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="audience" checked={form.audience === "ALL"} onChange={() => set("audience", "ALL")} disabled={form.structure === "SUPPORT"} /> {t("audienceAll")}
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="audience" checked={form.audience === "SUBSET"} onChange={() => set("audience", "SUBSET")} /> {t("audienceSubset")}
                </label>
              </div>
              {form.audience === "SUBSET" && (
                <div className="mt-2">
                  {form.homeGroupIds.length === 0 ? (
                    <p className="text-xs text-slate-500">{t("pickGroupsFirst")}</p>
                  ) : (
                    <StudentPicker students={pupils} selected={form.studentIds} onChange={(s) => set("studentIds", s)} excluded={hostPupils} maxHeight="max-h-[40vh]" />
                  )}
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>{t("fixedSlots")}</Label>
                <Input className="h-9 mt-1" placeholder="1:1-7, 3:2-7" value={form.fixedSlots} onChange={(e) => set("fixedSlots", e.target.value)} />
                <p className="text-xs text-slate-500 mt-1">{t("fixedSlotsHint")}</p>
              </div>
              <div>
                <Label>{t("note")}</Label>
                <Input className="h-9 mt-1" value={form.note} onChange={(e) => set("note", e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button onClick={save} disabled={!canSave || create.isPending || update.isPending}>{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
