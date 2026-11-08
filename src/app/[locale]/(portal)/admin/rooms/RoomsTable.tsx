"use client";

import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/client";
import type { RouterOutputs } from "@/trpc/types";
import { EditableTable, type ColumnSpec } from "@/components/EditableTable";
import { useErrorToast } from "@/components/useErrorToast";

type Row = RouterOutputs["rooms"]["list"][number];

export function RoomsTable() {
  const t = useTranslations("rooms");
  const toastError = useErrorToast();
  const utils = trpc.useUtils();
  const list = trpc.rooms.list.useQuery();
  const invalidate = () => Promise.all([utils.rooms.invalidate(), utils.lessons.roomOptions.invalidate()]);
  const create = trpc.rooms.create.useMutation({ onSuccess: invalidate, onError: toastError });
  const update = trpc.rooms.update.useMutation({ onSuccess: invalidate, onError: toastError });
  const remove = trpc.rooms.remove.useMutation({ onSuccess: invalidate, onError: toastError });

  const columns: ColumnSpec<Row>[] = [
    { key: "name", label: t("col.name"), type: "text", required: true, width: "w-40" },
    { key: "kind", label: t("col.kind"), type: "text", width: "w-48" },
    { key: "capacity", label: t("col.capacity"), type: "int", width: "w-28" },
    { key: "lessons", label: t("col.lessons"), type: "int", readOnly: true },
    { key: "note", label: t("col.note"), type: "text" },
  ];

  if (list.isLoading) return <p className="text-slate-500 text-sm">…</p>;

  return (
    <EditableTable<Row>
      rows={list.data ?? []}
      columns={columns}
      newDefaults={{ capacity: 24 }}
      onCreate={(d) =>
        create.mutateAsync({ name: String(d.name), kind: (d.kind as string) || null, capacity: d.capacity === "" || d.capacity === null ? null : Number(d.capacity), note: (d.note as string) || null })
      }
      onUpdate={(id, patch) => update.mutateAsync({ id, ...(patch as Partial<Parameters<typeof update.mutateAsync>[0]>) })}
      onDelete={(id) => remove.mutateAsync({ id })}
    />
  );
}
