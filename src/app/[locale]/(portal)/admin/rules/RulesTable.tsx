"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";
import type { RouterOutputs } from "@/trpc/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useErrorToast } from "@/components/useErrorToast";
import { ruleSpec } from "@/lib/rulesCatalog";
import { cn } from "@/lib/utils";

type Mode = "HARD" | "SOFT" | "OFF";
const MODES: Mode[] = ["HARD", "SOFT", "OFF"];

export function RulesTable() {
  const t = useTranslations("rules");
  const tCat = useTranslations("ruleCatalog");
  const toastError = useErrorToast();
  const utils = trpc.useUtils();
  const rules = trpc.rules.list.useQuery();
  const teachers = trpc.teachers.list.useQuery();
  const invalidate = () => utils.rules.invalidate();
  const update = trpc.rules.update.useMutation({ onSuccess: invalidate, onError: toastError });
  const setOverride = trpc.rules.setOverride.useMutation({ onSuccess: invalidate, onError: toastError });
  const [open, setOpen] = useState<string | null>(null);
  const [newTeacher, setNewTeacher] = useState("");

  if (rules.isLoading) return <p className="text-slate-500 text-sm">…</p>;

  const modeClass = (m: Mode) => (m === "HARD" ? "bg-red-100 text-red-800" : m === "SOFT" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500");

  const saveParams = (id: string, text: string) => {
    try {
      const params = text.trim() ? JSON.parse(text) : {};
      if (typeof params !== "object" || Array.isArray(params)) throw new Error();
      update.mutate({ id, params });
    } catch {
      toast.error(t("badParams"));
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-left">
          <tr>
            <th className="px-3 py-2 w-14">{t("col.code")}</th>
            <th className="px-3 py-2">{t("col.rule")}</th>
            <th className="px-3 py-2 w-40">{t("col.mode")}</th>
            <th className="px-3 py-2 w-24">{t("col.weight")}</th>
            <th className="px-3 py-2 w-64">{t("col.params")}</th>
            <th className="px-3 py-2 w-36">{t("col.overrides")}</th>
          </tr>
        </thead>
        <tbody>
          {rules.data!.map((r) => {
            const spec = ruleSpec(r.code);
            const expanded = open === r.id;
            return (
              <RuleRows
                key={r.id}
                r={r}
                perTeacher={spec?.perTeacher ?? false}
                expanded={expanded}
                onToggle={() => setOpen(expanded ? null : r.id)}
                name={tCat(`${r.code}.name`)}
                description={tCat(`${r.code}.description`)}
                modeLabel={(m) => t(`mode.${m}`)}
                modeClass={modeClass}
                onMode={(m) => update.mutate({ id: r.id, mode: m })}
                onWeight={(w) => update.mutate({ id: r.id, weight: w })}
                onParams={(txt) => saveParams(r.id, txt)}
                teachers={(teachers.data ?? []).map((x) => ({ id: x.id, name: x.name }))}
                newTeacher={newTeacher}
                setNewTeacher={setNewTeacher}
                onOverride={(teacherId, mode, weight) => setOverride.mutate({ ruleId: r.id, teacherId, mode, weight })}
                labels={{ add: t("addOverride"), remove: t("removeOverride"), none: t("noOverrides"), notPerTeacher: t("notPerTeacher") }}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type RuleRow = RouterOutputs["rules"]["list"][number];

function RuleRows(props: {
  r: RuleRow;
  perTeacher: boolean;
  expanded: boolean;
  onToggle: () => void;
  name: string;
  description: string;
  modeLabel: (m: Mode) => string;
  modeClass: (m: Mode) => string;
  onMode: (m: Mode) => void;
  onWeight: (w: number) => void;
  onParams: (txt: string) => void;
  teachers: { id: string; name: string }[];
  newTeacher: string;
  setNewTeacher: (v: string) => void;
  onOverride: (teacherId: string, mode: Mode | null, weight: number) => void;
  labels: { add: string; remove: string; none: string; notPerTeacher: string };
}) {
  const { r, perTeacher, expanded, onToggle, name, description, modeLabel, modeClass, onMode, onWeight, onParams, teachers, newTeacher, setNewTeacher, onOverride, labels } = props;
  const mode = r.mode as Mode;
  const used = new Set(r.overrides.map((o) => o.teacherId));
  return (
    <>
      <tr className="border-t border-slate-100 align-top">
        <td className="px-3 py-2 font-mono font-medium">{r.code}</td>
        <td className="px-3 py-2">
          <div className="font-medium text-slate-800">{name}</div>
          <div className="text-xs text-slate-500">{description}</div>
        </td>
        <td className="px-3 py-2">
          <div className="inline-flex rounded-md border border-slate-200 overflow-hidden">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onMode(m)}
                className={cn("px-2 py-1 text-xs", m === mode ? modeClass(m) + " font-semibold" : "bg-white text-slate-500 hover:bg-slate-50")}
              >
                {modeLabel(m)}
              </button>
            ))}
          </div>
        </td>
        <td className="px-3 py-2">
          <Input
            type="number"
            className="h-8 w-20"
            defaultValue={r.weight}
            disabled={mode !== "SOFT"}
            onBlur={(e) => {
              const w = Number(e.target.value);
              if (Number.isInteger(w) && w >= 0 && w !== r.weight) onWeight(w);
            }}
          />
        </td>
        <td className="px-3 py-2">
          <Input
            className="h-8 font-mono text-xs"
            defaultValue={JSON.stringify(r.params)}
            onBlur={(e) => {
              if (e.target.value !== JSON.stringify(r.params)) onParams(e.target.value);
            }}
          />
        </td>
        <td className="px-3 py-2">
          {perTeacher ? (
            <Button size="xs" variant="outline" onClick={onToggle}>
              {r.overrides.length} {expanded ? "▴" : "▾"}
            </Button>
          ) : (
            <span className="text-xs text-slate-400">{labels.notPerTeacher}</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/70">
          <td />
          <td colSpan={5} className="px-3 py-2">
            <div className="space-y-1">
              {r.overrides.length === 0 && <p className="text-xs text-slate-400">{labels.none}</p>}
              {r.overrides.map((o) => (
                <div key={o.teacherId} className="flex items-center gap-2 text-sm">
                  <span className="w-56 truncate">{o.teacher.name}</span>
                  <div className="inline-flex rounded-md border border-slate-200 overflow-hidden">
                    {MODES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => onOverride(o.teacherId, m, o.weight)}
                        className={cn("px-2 py-0.5 text-xs", m === o.mode ? modeClass(m) + " font-semibold" : "bg-white text-slate-500")}
                      >
                        {modeLabel(m)}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    className="h-7 w-16"
                    defaultValue={o.weight}
                    disabled={o.mode !== "SOFT"}
                    onBlur={(e) => {
                      const w = Number(e.target.value);
                      if (Number.isInteger(w) && w >= 0 && w !== o.weight) onOverride(o.teacherId, o.mode as Mode, w);
                    }}
                  />
                  <Button size="xs" variant="ghost" onClick={() => onOverride(o.teacherId, null, 1)}>
                    {labels.remove}
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <select className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs w-56" value={newTeacher} onChange={(e) => setNewTeacher(e.target.value)}>
                  <option value="">—</option>
                  {teachers.filter((x) => !used.has(x.id)).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="xs"
                  disabled={!newTeacher}
                  onClick={() => {
                    onOverride(newTeacher, mode === "OFF" ? "HARD" : mode === "HARD" ? "SOFT" : "HARD", r.weight);
                    setNewTeacher("");
                  }}
                >
                  {labels.add}
                </Button>
                <Badge variant="outline" className="text-xs">{r.overrides.length}</Badge>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
