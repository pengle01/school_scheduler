"use client";

import { useLocale, useTranslations } from "next-intl";
import { trpc } from "@/trpc/client";
import type { RouterOutputs } from "@/trpc/types";
import { EditableTable, type ColumnSpec } from "@/components/EditableTable";
import { useErrorToast } from "@/components/useErrorToast";

type Row = RouterOutputs["homeGroups"]["list"][number];

export const YEARS = ["A", "B", "C", "NONE"] as const;
export const DIRECTIONS = ["THEORY", "PRACTICE", "HOTEL", "SPECIAL", "NONE"] as const;

export function HomeGroupsTable() {
  const t = useTranslations("homeGroups");
  const tEnum = useTranslations("enums");
  const locale = useLocale();
  const toastError = useErrorToast();
  const utils = trpc.useUtils();
  const list = trpc.homeGroups.list.useQuery();
  const invalidate = () => utils.homeGroups.invalidate();
  const create = trpc.homeGroups.create.useMutation({ onSuccess: invalidate, onError: toastError });
  const update = trpc.homeGroups.update.useMutation({ onSuccess: invalidate, onError: toastError });
  const remove = trpc.homeGroups.remove.useMutation({ onSuccess: invalidate, onError: toastError });

  const opt = (prefix: string, values: readonly string[]) => values.map((v) => ({ value: v, label: tEnum(`${prefix}.${v}`) }));

  const columns: ColumnSpec<Row>[] = [
    { key: "name", label: t("col.name"), type: "text", required: true, width: "min-w-[160px]" },
    { key: "year", label: t("col.year"), type: "select", options: opt("year", YEARS), width: "w-28" },
    { key: "direction", label: t("col.direction"), type: "select", options: opt("direction", DIRECTIONS), width: "w-40" },
    { key: "students", label: t("col.students"), type: "int", readOnly: true },
    { key: "lessonCount", label: t("col.lessons"), type: "int", readOnly: true },
    { key: "periods", label: t("col.periods"), type: "int", readOnly: true },
    { key: "note", label: t("col.note"), type: "text" },
  ];

  if (list.isLoading) return <p className="text-slate-500 text-sm">…</p>;

  return (
    <EditableTable<Row>
      rows={list.data ?? []}
      columns={columns}
      newDefaults={{ year: "NONE", direction: "NONE" }}
      rowHref={(r) => `/${locale}/admin/home-groups/${r.id}`}
      onCreate={(d) =>
        create.mutateAsync({ name: String(d.name), year: d.year as (typeof YEARS)[number], direction: d.direction as (typeof DIRECTIONS)[number], note: (d.note as string) || null })
      }
      onUpdate={(id, patch) => update.mutateAsync({ id, ...(patch as Partial<Parameters<typeof update.mutateAsync>[0]>) })}
      onDelete={(id) => remove.mutateAsync({ id })}
    />
  );
}
