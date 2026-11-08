"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface PickableStudent {
  id: string;
  name: string;
  homeGroupId: string | null;
  homeGroupName?: string | null;
}

// Checklist of pupils (normally those of the lesson's home groups). Controlled.
export function StudentPicker({
  students,
  selected,
  onChange,
  excluded,
  maxHeight = "max-h-72",
}: {
  students: PickableStudent[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  // pupils that cannot be picked (e.g. already in the host lesson), shown greyed
  excluded?: Set<string>;
  maxHeight?: string;
}) {
  const t = useTranslations("picker");
  const [filter, setFilter] = useState("");
  const f = filter.trim().toLowerCase();
  const visible = students.filter((s) => !f || s.name.toLowerCase().includes(f) || (s.homeGroupName ?? "").toLowerCase().includes(f));
  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    onChange(n);
  };
  const setAll = (on: boolean) => {
    const n = new Set(selected);
    for (const s of visible) {
      if (excluded?.has(s.id)) continue;
      if (on) n.add(s.id);
      else n.delete(s.id);
    }
    onChange(n);
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <Input placeholder={t("filter")} value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8" />
        <Button size="xs" variant="outline" onClick={() => setAll(true)}>{t("all")}</Button>
        <Button size="xs" variant="outline" onClick={() => setAll(false)}>{t("none")}</Button>
        <span className="text-xs text-slate-500 whitespace-nowrap">{t("count", { n: selected.size })}</span>
      </div>
      <div className={`${maxHeight} overflow-auto border border-slate-200 rounded-md divide-y divide-slate-100 md:columns-2 xl:columns-3 md:[&>label]:break-inside-avoid`}>
        {visible.length === 0 && <p className="p-3 text-sm text-slate-400">{t("empty")}</p>}
        {visible.map((s) => {
          const ex = excluded?.has(s.id);
          return (
            <label key={s.id} className={`flex items-center gap-2 px-3 py-1 text-sm ${ex ? "text-slate-300" : "hover:bg-slate-50 cursor-pointer"}`}>
              <input type="checkbox" className="accent-emerald-600" disabled={ex} checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
              <span className="flex-1 truncate">{s.name}</span>
              {s.homeGroupName && <span className="text-xs text-slate-400">{s.homeGroupName}</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}
