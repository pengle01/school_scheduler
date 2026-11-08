"use client";

import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/client";
import type { RouterOutputs } from "@/trpc/types";
import { EditableTable, type ColumnSpec } from "@/components/EditableTable";
import { useErrorToast } from "@/components/useErrorToast";

type Row = RouterOutputs["subjects"]["list"][number];

export function SubjectsTable() {
  const t = useTranslations("subjects");
  const tEnum = useTranslations("enums");
  const toastError = useErrorToast();
  const utils = trpc.useUtils();
  const list = trpc.subjects.list.useQuery();
  const invalidate = () => utils.subjects.list.invalidate();
  const create = trpc.subjects.create.useMutation({ onSuccess: invalidate, onError: toastError });
  const update = trpc.subjects.update.useMutation({ onSuccess: invalidate, onError: toastError });
  const remove = trpc.subjects.remove.useMutation({ onSuccess: invalidate, onError: toastError });

  const levels = ["A", "B", "C", "NONE"].map((v) => ({ value: v, label: tEnum(`level.${v}`) }));

  const columns: ColumnSpec<Row>[] = [
    { key: "name", label: t("col.name"), type: "text", required: true, width: "min-w-[260px]" },
    { key: "level", label: t("col.level"), type: "select", options: levels, width: "w-28" },
    { key: "code", label: t("col.code"), type: "text", width: "w-32" },
    { key: "periodsPerWeek", label: t("col.periodsPerWeek"), type: "int", width: "w-24" },
    { key: "lessons", label: t("col.lessons"), type: "int", readOnly: true, render: (r) => r._count.lessons, sortValue: (r) => r._count.lessons },
    { key: "note", label: t("col.note"), type: "text" },
  ];

  if (list.isLoading) return <p className="text-slate-500 text-sm">…</p>;

  return (
    <EditableTable<Row>
      rows={list.data ?? []}
      columns={columns}
      newDefaults={{ level: "NONE", periodsPerWeek: 0 }}
      onCreate={(d) =>
        create.mutateAsync({
          name: String(d.name),
          level: d.level as "A" | "B" | "C" | "NONE",
          code: (d.code as string) || null,
          periodsPerWeek: d.periodsPerWeek === null || d.periodsPerWeek === "" ? null : Number(d.periodsPerWeek),
          note: (d.note as string) || null,
        })
      }
      onUpdate={(id, patch) => update.mutateAsync({ id, ...(patch as Partial<Parameters<typeof update.mutateAsync>[0]>) })}
      onDelete={(id) => remove.mutateAsync({ id })}
    />
  );
}
