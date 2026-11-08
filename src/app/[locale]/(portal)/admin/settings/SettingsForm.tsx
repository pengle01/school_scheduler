"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useErrorToast } from "@/components/useErrorToast";
import { totalSlots } from "@/lib/calendar";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri"] as const;

export function SettingsForm() {
  const t = useTranslations("settings");
  const tDays = useTranslations("days");
  const toastError = useErrorToast();
  const utils = trpc.useUtils();
  const settings = trpc.rules.settings.useQuery();
  const save = trpc.rules.setSettings.useMutation({
    onSuccess: () => {
      utils.rules.settings.invalidate();
      toast.success(t("saved"));
    },
    onError: toastError,
  });
  const [days, setDays] = useState<number[]>([8, 7, 7, 8, 7]);
  const [schoolName, setSchoolName] = useState("");

  // Sync the form once per fetched value (derived state, no effect).
  const [synced, setSynced] = useState<typeof settings.data>(undefined);
  if (settings.data && settings.data !== synced) {
    setSynced(settings.data);
    setDays(settings.data.daysPeriods);
    setSchoolName(settings.data.schoolName);
  }

  if (settings.isLoading) return <p className="text-slate-500 text-sm">…</p>;

  return (
    <div className="grid md:grid-cols-2 gap-5 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>{t("week")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-500">{t("weekHint")}</p>
          {DAY_KEYS.map((d, i) => (
            <div key={d} className="flex items-center gap-3">
              <Label className="w-28">{tDays(d)}</Label>
              <Input
                type="number"
                min={1}
                max={12}
                className="h-8 w-24"
                value={days[i]}
                onChange={(e) => setDays((ds) => ds.map((v, j) => (j === i ? Number(e.target.value) : v)))}
              />
            </div>
          ))}
          <p className="text-sm text-slate-600">{t("totalSlots", { n: totalSlots(days) })}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("school")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>{t("schoolName")}</Label>
            <Input className="h-8 mt-1" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
          </div>
          <Button
            size="sm"
            disabled={save.isPending || days.some((d) => !Number.isInteger(d) || d < 1 || d > 12)}
            onClick={() => save.mutate({ daysPeriods: days, schoolName })}
          >
            {t("save")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
