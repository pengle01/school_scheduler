"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpDown, Plus, Trash2, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export type Option = { value: string; label: string };

export type ColumnSpec<Row> = {
  key: string; // field name in the row / draft
  label: string;
  type: "text" | "int" | "bool" | "select";
  options?: Option[]; // for select
  nullable?: boolean; // select: allow empty
  required?: boolean;
  width?: string; // tailwind width class
  // Read-only derived column
  render?: (row: Row) => React.ReactNode;
  readOnly?: boolean;
  // Text filter uses this (default: displayed text)
  filterText?: (row: Row) => string;
  // Sort value (default: row[key])
  sortValue?: (row: Row) => string | number | boolean | null | undefined;
};

type Draft = Record<string, string | number | boolean | null>;

export interface EditableTableProps<Row extends { id: string }> {
  rows: Row[];
  columns: ColumnSpec<Row>[];
  // Called with the changed field only
  onUpdate: (id: string, patch: Draft) => Promise<unknown>;
  onCreate?: (draft: Draft) => Promise<unknown>;
  onDelete?: (id: string) => Promise<unknown>;
  newDefaults?: Draft;
  rowClassName?: (row: Row) => string | undefined;
  rowHref?: (row: Row) => string;
  emptyText?: string;
  actions?: (row: Row) => React.ReactNode;
  pageSize?: number;
}

function cellValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

// Cells are plain text; only the cell being edited mounts an input/select. With
// 1,000+ rows and dropdowns of hundreds of options this is the difference between
// a page that drags and one that is instant.
export function EditableTable<Row extends { id: string }>({
  rows,
  columns,
  onUpdate,
  onCreate,
  onDelete,
  newDefaults,
  rowClassName,
  rowHref,
  emptyText,
  actions,
  pageSize = 100,
}: EditableTableProps<Row>) {
  const t = useTranslations("table");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [toDelete, setToDelete] = useState<Row | null>(null);

  // value → label lookups for select columns (so display needs no option scan)
  const labels = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const c of columns) if (c.type === "select" && c.options) m.set(c.key, new Map(c.options.map((o) => [o.value, o.label])));
    return m;
  }, [columns]);

  const display = (row: Row, c: ColumnSpec<Row>): string => {
    const v = (row as Record<string, unknown>)[c.key];
    if (c.type === "select") return labels.get(c.key)?.get(cellValue(v)) ?? (v == null ? "" : cellValue(v));
    if (c.type === "bool") return v ? "✓" : "";
    return cellValue(v);
  };

  // Pre-computed lowercase search text per row
  const searchText = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.id, columns.map((c) => (c.filterText ? c.filterText(r) : display(r, c))).join(" ").toLowerCase());
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns, labels]);

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let list = f ? rows.filter((r) => (searchText.get(r.id) ?? "").includes(f)) : rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const val = (r: Row) => (col?.sortValue ? col.sortValue(r) : col?.type === "select" ? display(r, col) : (r as Record<string, unknown>)[sort.key]) as string | number | boolean | null | undefined;
      list = [...list].sort((a, b) => {
        const va = val(a), vb = val(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === "number" && typeof vb === "number") return (va - vb) * sort.dir;
        return String(va).localeCompare(String(vb), "el") * sort.dir;
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns, filter, sort, searchText]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = visible.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const toggleSort = (key: string) => setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));

  const startNew = () => {
    const d: Draft = {};
    for (const c of columns) {
      if (c.readOnly) continue;
      d[c.key] = newDefaults?.[c.key] ?? (c.type === "bool" ? true : c.type === "int" ? 0 : c.type === "select" ? (c.nullable ? null : c.options?.[0]?.value ?? "") : "");
    }
    setDraft(d);
  };

  const saveNew = async () => {
    if (!draft || !onCreate) return;
    for (const c of columns) if (c.required && !c.readOnly && cellValue(draft[c.key]).trim() === "") return;
    setBusy("new");
    try {
      await onCreate(draft);
      setDraft(null);
    } finally {
      setBusy(null);
    }
  };

  const commit = async (row: Row, col: ColumnSpec<Row>, raw: string | boolean) => {
    setEditing(null);
    let value: string | number | boolean | null = raw;
    if (col.type === "int") {
      const n = Number(raw);
      if (raw === "" || !Number.isFinite(n)) return;
      value = Math.trunc(n);
    } else if (col.type === "select" && raw === "") {
      value = col.nullable ? null : "";
      if (value === "") return;
    } else if (col.type === "text") {
      const s = String(raw).trim();
      if (s === "" && col.required) return;
      value = s === "" ? null : s;
    }
    if ((row as Record<string, unknown>)[col.key] === value) return;
    setBusy(row.id);
    try {
      await onUpdate(row.id, { [col.key]: value });
    } finally {
      setBusy(null);
    }
  };

  const renderEditor = (col: ColumnSpec<Row>, value: unknown, onCommit: (v: string | boolean) => void, onCancel?: () => void) => {
    if (col.type === "bool") {
      return <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={Boolean(value)} onChange={(e) => onCommit(e.target.checked)} />;
    }
    if (col.type === "select") {
      return (
        <select
          autoFocus
          className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
          defaultValue={cellValue(value)}
          onChange={(e) => onCommit(e.target.value)}
          onBlur={(e) => onCommit(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onCancel?.()}
        >
          {col.nullable && <option value="">—</option>}
          {col.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <Input
        type={col.type === "int" ? "number" : "text"}
        className="h-8"
        defaultValue={cellValue(value)}
        autoFocus
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") onCancel?.();
        }}
      />
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={t("filter")}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(0);
          }}
          className="h-9 max-w-xs"
        />
        <span className="text-sm text-slate-500">{t("count", { shown: visible.length, total: rows.length })}</span>
        {pageCount > 1 && (
          <span className="inline-flex items-center gap-1 text-sm text-slate-600">
            <Button size="icon-xs" variant="ghost" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="previous">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {safePage + 1} / {pageCount}
            <Button size="icon-xs" variant="ghost" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label="next">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </span>
        )}
        {onCreate && (
          <Button size="sm" className="ml-auto" onClick={startNew} disabled={!!draft}>
            <Plus className="w-4 h-4" /> {t("add")}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn("text-left font-medium px-3 py-2 whitespace-nowrap", c.width)}>
                  <button type="button" className="inline-flex items-center gap-1 hover:text-slate-900" onClick={() => toggleSort(c.key)}>
                    {c.label}
                    <ArrowUpDown className={cn("w-3 h-3", sort?.key === c.key ? "text-emerald-600" : "text-slate-300")} />
                  </button>
                </th>
              ))}
              {(onDelete || actions || rowHref) && <th className="w-24" />}
            </tr>
          </thead>
          <tbody>
            {draft && (
              <DraftRow columns={columns} draft={draft} setDraft={setDraft} busy={busy === "new"} onSave={saveNew} onCancel={() => setDraft(null)} t={t} />
            )}
            {visible.length === 0 && !draft && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-8 text-center text-slate-400">
                  {emptyText ?? t("empty")}
                </td>
              </tr>
            )}
            {pageRows.map((row) => (
              <tr key={row.id} className={cn("border-t border-slate-100 hover:bg-slate-50/60", busy === row.id && "opacity-60", rowClassName?.(row))}>
                {columns.map((c) => {
                  const isEditing = editing?.id === row.id && editing.key === c.key;
                  const value = (row as Record<string, unknown>)[c.key];
                  if (c.render) return <td key={c.key} className="px-3 py-1.5">{c.render(row)}</td>;
                  if (c.readOnly) return <td key={c.key} className="px-3 py-1.5">{display(row, c)}</td>;
                  if (c.type === "bool") return <td key={c.key} className="px-3 py-1.5">{renderEditor(c, value, (v) => commit(row, c, v))}</td>;
                  return (
                    <td key={c.key} className={cn("px-1 py-0.5", !isEditing && "cursor-text")} onClick={() => !isEditing && setEditing({ id: row.id, key: c.key })}>
                      {isEditing ? (
                        renderEditor(c, value, (v) => commit(row, c, v), () => setEditing(null))
                      ) : (
                        <div className="px-2 py-1 rounded hover:bg-emerald-50 min-h-7 truncate" title={display(row, c)}>
                          {display(row, c) || <span className="text-slate-300">—</span>}
                        </div>
                      )}
                    </td>
                  );
                })}
                {(onDelete || actions || rowHref) && (
                  <td className="px-2 py-1 whitespace-nowrap text-right">
                    {rowHref && (
                      <a href={rowHref(row)} className="text-emerald-700 hover:underline text-xs mr-2">
                        {t("open")}
                      </a>
                    )}
                    {actions?.(row)}
                    {onDelete && (
                      <Button size="icon-sm" variant="ghost" aria-label={t("delete")} onClick={() => setToDelete(row)}>
                        <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-600" />
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteText")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (toDelete && onDelete) await onDelete(toDelete.id);
                setToDelete(null);
              }}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// The "new record" row keeps live editors in every cell (one row only).
function DraftRow<Row>({
  columns,
  draft,
  setDraft,
  busy,
  onSave,
  onCancel,
  t,
}: {
  columns: ColumnSpec<Row>[];
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  t: (key: string) => string;
}) {
  const first = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  const firstEditable = columns.findIndex((c) => !c.readOnly);
  return (
    <tr className="bg-emerald-50/60 border-t border-emerald-100">
      {columns.map((c, i) => {
        if (c.readOnly) return <td key={c.key} className="px-2 py-1.5" />;
        const ref = i === firstEditable ? first : undefined;
        const set = (v: string | boolean) => setDraft((d) => ({ ...d!, [c.key]: v }));
        return (
          <td key={c.key} className="px-2 py-1.5">
            {c.type === "bool" ? (
              <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={Boolean(draft[c.key])} onChange={(e) => set(e.target.checked)} />
            ) : c.type === "select" ? (
              <select
                ref={ref as React.Ref<HTMLSelectElement>}
                className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
                value={cellValue(draft[c.key])}
                onChange={(e) => set(e.target.value)}
              >
                {c.nullable && <option value="">—</option>}
                {c.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                ref={ref as React.Ref<HTMLInputElement>}
                type={c.type === "int" ? "number" : "text"}
                className="h-8"
                value={cellValue(draft[c.key])}
                onChange={(e) => set(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSave();
                  if (e.key === "Escape") onCancel();
                }}
              />
            )}
          </td>
        );
      })}
      <td className="px-2 py-1.5 whitespace-nowrap">
        <Button size="sm" onClick={onSave} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("save")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </td>
    </tr>
  );
}
