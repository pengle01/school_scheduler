"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { trpc } from "@/trpc/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LessonTable } from "@/components/LessonTable";
import { LessonDialog } from "@/components/LessonDialog";

export function BandDetail({ id }: { id: string }) {
  const t = useTranslations("bandDetail");
  const tEnum = useTranslations("enums");
  const locale = useLocale();
  const band = trpc.bands.byId.useQuery({ id });
  const [adding, setAdding] = useState(false);

  if (band.isLoading) return <p className="text-slate-500 text-sm">…</p>;
  if (!band.data) return <p className="text-slate-500 text-sm">{t("notFound")}</p>;
  const b = band.data;
  const hgIds = [...new Set(b.lessons.flatMap((l) => l.homeGroups.map((h) => h.homeGroupId)))];

  return (
    <>
      <PageHeader title={b.name} description={`${tEnum(`bandKind.${b.kind}`)} · ${b.homeGroupNames.join(", ")}`}>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4" /> {t("addOption")}
          </Button>
          <Link href={`/${locale}/admin/bands`} className="text-sm text-emerald-700 hover:underline self-center">
            ← {t("back")}
          </Link>
        </div>
      </PageHeader>

      <p className="text-sm text-slate-600 mb-4">{t("explain")}</p>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {t("options")} <Badge variant="outline">{b.lessons.length}</Badge>
            {b.check.periodMismatch && <Badge variant="destructive">{t("mismatch")}</Badge>}
            {b.check.inTwoOptions.length > 0 && <Badge variant="destructive">{t("inTwo", { n: b.check.inTwoOptions.length })}</Badge>}
            {b.check.inNoOption.length > 0 && <Badge variant="outline" className="text-amber-700 border-amber-300">{t("inNone", { n: b.check.inNoOption.length })}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LessonTable lessons={b.lessons} showStructure={false} emptyText={t("noOptions")} />
        </CardContent>
      </Card>

      <LessonDialog open={adding} onClose={() => setAdding(false)} defaults={{ bandId: id, homeGroupIds: hgIds }} lockStructure />
    </>
  );
}
