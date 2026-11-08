"use client";

import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/client";
import type { RouterOutputs } from "@/trpc/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Row = RouterOutputs["students"]["lessons"]["attending"][number];

// What one pupil sits in, and what they leave and why. Opened from the Students and Support screens.
export function StudentLessonsDialog({ studentId, week, onClose }: { studentId: string | null; week: number; onClose: () => void }) {
  const t = useTranslations("students.lessonsDialog");
  const tEnum = useTranslations("enums");
  const data = trpc.students.lessons.useQuery({ id: studentId ?? "" }, { enabled: !!studentId });
  const d = data.data;

  const structure = (l: Row) => {
    if (l.supportKind) return `${tEnum(`supportKind.${l.supportKind}`)}${l.host ? ` · ${t("during", { host: l.host })}` : ""}`;
    if (l.band) return t("band", { name: l.band });
    return l.homeGroups.length > 1 ? t("merge") : "";
  };

  return (
    <Dialog open={!!studentId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[96vw] sm:max-w-[860px] max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {d ? `${d.externalId ? `${d.externalId} · ` : ""}${d.name}${d.homeGroup ? ` · ${d.homeGroup}` : ""}` : "…"}
          </DialogTitle>
          <DialogDescription className={cn(d && d.total !== week && "font-medium text-red-700")}>{d ? t("total", { total: d.total, week }) : " "}</DialogDescription>
        </DialogHeader>
        {d && (
          <div className="space-y-4">
            <section>
              <h4 className="mb-1 text-sm font-medium text-slate-700">{t("attending")}</h4>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="py-1 pr-2">{t("col.subject")}</th>
                    <th className="py-1 pr-2">{t("col.teacher")}</th>
                    <th className="py-1 pr-2">{t("col.groups")}</th>
                    <th className="py-1 pr-2">{t("col.structure")}</th>
                    <th className="py-1 text-right">{t("col.periods")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.attending.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="py-1 pr-2">{l.subject}</td>
                      <td className="py-1 pr-2 text-slate-600">{l.teacher ?? t("vacancy")}</td>
                      <td className="py-1 pr-2 text-xs text-slate-500">{l.homeGroups.join("+")}</td>
                      <td className="py-1 pr-2 text-xs text-slate-500">{structure(l)}</td>
                      <td className="py-1 text-right">{l.periods}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            {d.left.length > 0 && (
              <section>
                <h4 className="mb-1 text-sm font-medium text-slate-700">{t("left")}</h4>
                <table className="w-full text-sm">
                  <tbody>
                    {d.left.map((l) => (
                      <tr key={l.id} className="border-t border-slate-100 text-slate-500">
                        <td className="py-1 pr-2">{l.subject}</td>
                        <td className="py-1 pr-2">{l.teacher ?? t("vacancy")}</td>
                        <td className="py-1 pr-2 text-xs">{l.reason === "excused" ? t("leftExcused") : t("leftForSupport")}</td>
                        <td className="py-1 text-right">{l.periods}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
