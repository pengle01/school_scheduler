"use client";

import { useLocale, useTranslations } from "next-intl";
import { trpc } from "@/trpc/client";
import type { RouterOutputs } from "@/trpc/types";
import { EditableTable, type ColumnSpec } from "@/components/EditableTable";
import { useErrorToast } from "@/components/useErrorToast";
import { teacherLoad } from "@/lib/load";
import { cn } from "@/lib/utils";

type Row = RouterOutputs["teachers"]["list"][number];

export const DEPARTMENTS = ["Α", "Β", "Γ", "Δ", "Ε", "ΕΓ", "ΕΔ", "ΕΕ", "ΕΚ", "ΕΠ", "Θ", "ΗΛ", "ΗΥ", "Μ", "Ξ", "Ρ", "Σ", "ΣΕΑ", "Τ", "Φ", "Χ", "Ω"];

export function TeachersTable() {
  const t = useTranslations("teachers");
  const locale = useLocale();
  const toastError = useErrorToast();
  const utils = trpc.useUtils();
  const list = trpc.teachers.list.useQuery();
  const invalidate = () => utils.teachers.list.invalidate();
  const create = trpc.teachers.create.useMutation({ onSuccess: invalidate, onError: toastError });
  const update = trpc.teachers.update.useMutation({ onSuccess: invalidate, onError: toastError });
  const remove = trpc.teachers.remove.useMutation({ onSuccess: invalidate, onError: toastError });

  const columns: ColumnSpec<Row>[] = [
    { key: "name", label: t("col.name"), type: "text", required: true, width: "min-w-[220px]" },
    { key: "firstName", label: t("col.firstName"), type: "text" },
    { key: "department", label: t("col.department"), type: "select", nullable: true, options: DEPARTMENTS.map((d) => ({ value: d, label: d })) },
    { key: "obligation", label: t("col.obligation"), type: "int", width: "w-24" },
    { key: "reduction", label: t("col.reduction"), type: "int", width: "w-24" },
    {
      key: "assigned",
      label: t("col.assigned"),
      type: "int",
      readOnly: true,
      render: (r) => {
        const load = teacherLoad({ obligation: r.obligation, reduction: r.reduction, assigned: r.assigned });
        return (
          <span className={cn("font-medium", load.status === "ok" ? "text-emerald-700" : load.status === "under" ? "text-amber-700" : "text-red-700")}>
            {r.assigned} / {load.target}
          </span>
        );
      },
    },
    { key: "active", label: t("col.active"), type: "bool", width: "w-16" },
    { key: "note", label: t("col.note"), type: "text" },
  ];

  if (list.isLoading) return <p className="text-slate-500 text-sm">…</p>;

  return (
    <EditableTable<Row>
      rows={list.data ?? []}
      columns={columns}
      newDefaults={{ obligation: 24, reduction: 0, active: true, department: null }}
      rowHref={(r) => `/${locale}/admin/teachers/${r.id}`}
      rowClassName={(r) => (!r.active ? "text-slate-400" : undefined)}
      onCreate={async (d) =>
        create.mutateAsync({
          name: String(d.name),
          firstName: (d.firstName as string) || null,
          department: (d.department as string) || null,
          obligation: Number(d.obligation),
          reduction: Number(d.reduction),
          active: Boolean(d.active),
          note: (d.note as string) || null,
        })
      }
      onUpdate={(id, patch) => update.mutateAsync({ id, ...(patch as Partial<Parameters<typeof update.mutateAsync>[0]>) })}
      onDelete={(id) => remove.mutateAsync({ id })}
    />
  );
}
