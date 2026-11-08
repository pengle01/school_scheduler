"use client";

import { useLocale, useTranslations } from "next-intl";
import { trpc } from "@/trpc/client";
import type { RouterOutputs } from "@/trpc/types";
import { EditableTable, type ColumnSpec } from "@/components/EditableTable";
import { useErrorToast } from "@/components/useErrorToast";
import { Badge } from "@/components/ui/badge";

type Row = RouterOutputs["bands"]["list"][number];

export const BAND_KINDS = ["ELECTIVE", "LEVEL", "PARALLEL"] as const;

export function BandsTable() {
  const t = useTranslations("bands");
  const tEnum = useTranslations("enums");
  const locale = useLocale();
  const toastError = useErrorToast();
  const utils = trpc.useUtils();
  const list = trpc.bands.list.useQuery();
  const invalidate = () => utils.bands.invalidate();
  const create = trpc.bands.create.useMutation({ onSuccess: invalidate, onError: toastError });
  const update = trpc.bands.update.useMutation({ onSuccess: invalidate, onError: toastError });
  const remove = trpc.bands.remove.useMutation({ onSuccess: invalidate, onError: toastError });

  const columns: ColumnSpec<Row>[] = [
    { key: "name", label: t("col.name"), type: "text", required: true, width: "min-w-[160px]" },
    { key: "kind", label: t("col.kind"), type: "select", options: BAND_KINDS.map((v) => ({ value: v, label: tEnum(`bandKind.${v}`) })), width: "w-44" },
    {
      key: "homeGroups",
      label: t("col.homeGroups"),
      type: "text",
      readOnly: true,
      render: (r) => <span className="text-slate-500">{r.homeGroups.join(", ")}</span>,
      filterText: (r) => r.homeGroups.join(" "),
      sortValue: (r) => r.homeGroups.join(" "),
    },
    { key: "options", label: t("col.options"), type: "int", readOnly: true },
    {
      key: "periods",
      label: t("col.periods"),
      type: "int",
      readOnly: true,
      render: (r) => (r.mismatch ? <Badge variant="destructive">{t("mismatch")}</Badge> : r.periods ?? "—"),
    },
    { key: "note", label: t("col.note"), type: "text" },
  ];

  if (list.isLoading) return <p className="text-slate-500 text-sm">…</p>;

  return (
    <EditableTable<Row>
      rows={list.data ?? []}
      columns={columns}
      newDefaults={{ kind: "ELECTIVE" }}
      rowHref={(r) => `/${locale}/admin/bands/${r.id}`}
      onCreate={(d) => create.mutateAsync({ name: String(d.name), kind: d.kind as (typeof BAND_KINDS)[number], note: (d.note as string) || null })}
      onUpdate={(id, patch) => update.mutateAsync({ id, ...(patch as Partial<Parameters<typeof update.mutateAsync>[0]>) })}
      onDelete={(id) => remove.mutateAsync({ id })}
    />
  );
}
