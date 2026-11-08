"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { trpc } from "@/trpc/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LessonTable } from "@/components/LessonTable";
import { LessonDialog, type LessonDialogProps } from "@/components/LessonDialog";
import { useErrorToast } from "@/components/useErrorToast";

export function HomeGroupDetail({ id }: { id: string }) {
  const t = useTranslations("homeGroupDetail");
  const tEnum = useTranslations("enums");
  const locale = useLocale();
  const toastError = useErrorToast();
  const utils = trpc.useUtils();
  const group = trpc.homeGroups.byId.useQuery({ id });
  const [dialog, setDialog] = useState<Pick<LessonDialogProps, "defaults" | "lockStructure"> | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [names, setNames] = useState("");
  const bulk = trpc.students.bulkCreate.useMutation({
    onSuccess: (r) => {
      utils.homeGroups.invalidate();
      utils.students.invalidate();
      toast.success(t("bulkDone", { n: r.count }));
      setBulkOpen(false);
      setNames("");
    },
    onError: toastError,
  });

  if (group.isLoading) return <p className="text-slate-500 text-sm">…</p>;
  if (!group.data) return <p className="text-slate-500 text-sm">{t("notFound")}</p>;
  const g = group.data;

  const own = g.lessons.filter((l) => !l.hostLessonId);
  const plain = own.filter((l) => l.homeGroups.length === 1 && !l.bandId && l.supports.length === 0);
  const merges = own.filter((l) => l.homeGroups.length > 1 && !l.bandId && l.supports.length === 0);
  const hosts = own.filter((l) => l.supports.length > 0);
  const bandOptions = own.filter((l) => l.bandId);
  const uncoveredOf = (lessonId: string) => g.hosts.find((h) => h.lessonId === lessonId)?.uncovered.length ?? 0;

  return (
    <>
      <PageHeader title={g.name} description={`${tEnum(`year.${g.year}`)} · ${tEnum(`direction.${g.direction}`)} · ${t("pupils", { n: g.students.length })}`}>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setDialog({ defaults: { homeGroupIds: [id] } })}>
            <Plus className="w-4 h-4" /> {t("addLesson")}
          </Button>
          <Link href={`/${locale}/admin/home-groups`} className="text-sm text-emerald-700 hover:underline self-center">
            ← {t("back")}
          </Link>
        </div>
      </PageHeader>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t("lessons")} <Badge variant="outline">{plain.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LessonTable lessons={plain} showGroups={false} showStructure={false} />
          </CardContent>
        </Card>

        {hosts.map((h) => {
          const uncovered = uncoveredOf(h.id);
          return (
            <Card key={h.id} className="border-amber-200">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {t("hostBlock", { subject: h.subject.name })}
                  <Badge variant="outline">{h.periods} {t("periodsShort")}</Badge>
                  {h.audience === "SUBSET" && <Badge variant="outline">{t("inHost", { n: h.students.length })}</Badge>}
                  {uncovered > 0 ? (
                    <Badge variant="destructive">{t("uncovered", { n: uncovered })}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-emerald-700 border-emerald-300">{t("covered")}</Badge>
                  )}
                  <Button size="xs" variant="outline" className="ml-auto" onClick={() => setDialog({ defaults: { homeGroupIds: h.homeGroups.map((x) => x.homeGroupId), hostLessonId: h.id, supportKind: "ST" }, lockStructure: true })}>
                    <Plus className="w-3 h-3" /> {t("addSupport")}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <LessonTable lessons={[h]} showGroups={h.homeGroups.length > 1} showStructure={false} compact />
                <div className="pl-4 border-l-2 border-amber-200">
                  <div className="text-xs text-slate-500 mb-1">{t("duringThis")}</div>
                  <LessonTable lessons={h.supports} showGroups={false} compact emptyText={t("noSupport")} />
                </div>
              </CardContent>
            </Card>
          );
        })}

        {merges.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t("merges")} <Badge variant="outline">{merges.length}</Badge></CardTitle>
            </CardHeader>
            <CardContent>
              <LessonTable lessons={merges} showStructure={false} />
            </CardContent>
          </Card>
        )}

        {bandOptions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t("bandOptions")} <Badge variant="outline">{bandOptions.length}</Badge></CardTitle>
            </CardHeader>
            <CardContent>
              <LessonTable lessons={bandOptions} showGroups={false} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t("students")} <Badge variant="outline">{g.students.length}</Badge>
              <Button size="xs" variant="outline" className="ml-auto" onClick={() => setBulkOpen(true)}>
                <Plus className="w-3 h-3" /> {t("bulkAdd")}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {g.students.length === 0 ? (
              <p className="text-sm text-slate-400">{t("noStudents")}</p>
            ) : (
              <div className="columns-2 md:columns-3 xl:columns-4 text-sm [&>div]:break-inside-avoid">
                {g.students.map((s) => (
                  <div key={s.id} className="py-0.5">
                    {s.name} {s.externalId && <span className="text-xs text-slate-400">{s.externalId}</span>}
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-2">
              {t("studentsHint")} <Link className="text-emerald-700 hover:underline" href={`/${locale}/admin/students`}>{t("studentsPage")}</Link>
            </p>
          </CardContent>
        </Card>
      </div>

      <LessonDialog open={!!dialog} onClose={() => setDialog(null)} defaults={dialog?.defaults} lockStructure={dialog?.lockStructure} />

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bulkTitle")}</DialogTitle>
            <DialogDescription>{t("bulkText", { group: g.name })}</DialogDescription>
          </DialogHeader>
          <Textarea rows={10} value={names} onChange={(e) => setNames(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkOpen(false)}>{t("cancel")}</Button>
            <Button disabled={names.trim() === "" || bulk.isPending} onClick={() => bulk.mutate({ homeGroupId: id, names: names.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) })}>
              {t("bulkSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
