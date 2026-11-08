"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";
import type { RouterOutputs } from "@/trpc/types";
import { EditableTable, type ColumnSpec } from "@/components/EditableTable";
import { useErrorToast } from "@/components/useErrorToast";
import { StudentLessonsDialog } from "@/components/StudentLessonsDialog";
import { DEFAULT_DAYS_PERIODS, totalSlots } from "@/lib/calendar";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Row = RouterOutputs["students"]["list"][number];

export function StudentsTable() {
  const t = useTranslations("students");
  const tEnum = useTranslations("enums");
  const toastError = useErrorToast();
  const utils = trpc.useUtils();
  const list = trpc.students.list.useQuery();
  const groups = trpc.homeGroups.options.useQuery();
  const settings = trpc.rules.settings.useQuery();
  const week = totalSlots(settings.data?.daysPeriods ?? DEFAULT_DAYS_PERIODS);
  const [openPupil, setOpenPupil] = useState<string | null>(null);
  const invalidate = () => Promise.all([utils.students.list.invalidate(), utils.homeGroups.invalidate()]);
  const create = trpc.students.create.useMutation({ onSuccess: invalidate, onError: toastError });
  const update = trpc.students.update.useMutation({ onSuccess: invalidate, onError: toastError });
  const remove = trpc.students.remove.useMutation({ onSuccess: invalidate, onError: toastError });
  const bulk = trpc.students.bulkCreate.useMutation({
    onSuccess: (r) => {
      invalidate();
      toast.success(t("bulk.done", { n: r.count }));
      setBulkOpen(false);
      setNames("");
    },
    onError: toastError,
  });

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkGroup, setBulkGroup] = useState("");
  const [names, setNames] = useState("");

  const homeGroups = groups.data ?? [];
  const groupOptions = homeGroups.map((g) => ({ value: g.id, label: g.name }));
  const genders = ["M", "F", "NONE"].map((v) => ({ value: v, label: tEnum(`gender.${v}`) }));

  const columns: ColumnSpec<Row>[] = [
    {
      key: "open",
      label: "",
      type: "text",
      readOnly: true,
      width: "w-10",
      render: (r) => (
        <button type="button" aria-label={t("openLessons")} title={t("openLessons")} className="text-emerald-700 hover:text-emerald-900" onClick={() => setOpenPupil(r.id)}>
          <BookOpen className="h-4 w-4" />
        </button>
      ),
    },
    { key: "name", label: t("col.name"), type: "text", required: true, width: "min-w-[240px]" },
    { key: "externalId", label: t("col.externalId"), type: "text", width: "w-28" },
    {
      key: "homeGroupId",
      label: t("col.homeGroup"),
      type: "select",
      nullable: true,
      options: groupOptions,
      filterText: (r) => r.homeGroup?.name ?? "",
      sortValue: (r) => r.homeGroup?.name ?? null,
    },
    { key: "gender", label: t("col.gender"), type: "select", options: genders, width: "w-24" },
    {
      key: "periods",
      label: t("col.periods"),
      type: "int",
      readOnly: true,
      width: "w-24",
      sortValue: (r) => r.periods,
      render: (r) => (
        <button type="button" className="hover:underline" title={t("openLessons")} onClick={() => setOpenPupil(r.id)}>
          {r.periods}
        </button>
      ),
    },
    {
      key: "lessonsCount",
      label: t("col.lessons"),
      type: "int",
      readOnly: true,
      render: (r) => (
        <span className="text-slate-500 text-xs">
          {r.lessons.map((x) => (x.lesson.band ? `${x.lesson.band.name}: ` : x.lesson.supportKind ? `${x.lesson.supportKind} ` : "") + x.lesson.subject.name).join(" · ")}
        </span>
      ),
      filterText: (r) => r.lessons.map((x) => x.lesson.subject.name).join(" "),
      sortValue: (r) => r.lessons.length,
    },
  ];

  if (list.isLoading || groups.isLoading) return <p className="text-slate-500 text-sm">…</p>;

  return (
    <>
      <div className="flex justify-end mb-2">
        <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)} disabled={homeGroups.length === 0}>
          {t("bulk.button")}
        </Button>
      </div>
      <EditableTable<Row>
        rows={list.data ?? []}
        columns={columns}
        newDefaults={{ gender: "NONE", homeGroupId: null }}
        onCreate={(d) =>
          create.mutateAsync({
            name: String(d.name),
            externalId: (d.externalId as string) || null,
            homeGroupId: (d.homeGroupId as string) || null,
            gender: d.gender as "M" | "F" | "NONE",
          })
        }
        onUpdate={(id, patch) => update.mutateAsync({ id, ...(patch as Partial<Parameters<typeof update.mutateAsync>[0]>) })}
        onDelete={(id) => remove.mutateAsync({ id })}
      />

      <StudentLessonsDialog studentId={openPupil} week={week} onClose={() => setOpenPupil(null)} />

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bulk.title")}</DialogTitle>
            <DialogDescription>{t("bulk.text")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm" value={bulkGroup} onChange={(e) => setBulkGroup(e.target.value)}>
              <option value="">—</option>
              {homeGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <Textarea rows={10} value={names} onChange={(e) => setNames(e.target.value)} placeholder={t("bulk.placeholder")} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkOpen(false)}>
              {t("bulk.cancel")}
            </Button>
            <Button
              disabled={!bulkGroup || names.trim() === "" || bulk.isPending}
              onClick={() =>
                bulk.mutate({
                  homeGroupId: bulkGroup,
                  names: names.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
                })
              }
            >
              {t("bulk.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
