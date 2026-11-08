"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useErrorToast } from "@/components/useErrorToast";
import type { ImportCounts } from "@/lib/exportFormat";

export function ExportImport() {
  const t = useTranslations("data");
  const toastError = useErrorToast();
  const utils = trpc.useUtils();
  const exportQuery = trpc.data.export.useQuery(undefined, { enabled: false });
  const importMut = trpc.data.import.useMutation({ onError: toastError });

  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [preview, setPreview] = useState<{ counts: ImportCounts; problems: string[] } | null>(null);

  const download = async () => {
    const res = await exportQuery.refetch();
    if (!res.data) return;
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `school-scheduler-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    const content = await f.text();
    setText(content);
    setPreview(null);
    importMut.mutate({ text: content, mode, dryRun: true }, { onSuccess: (r) => setPreview({ counts: r.counts, problems: r.problems }) });
  };

  const apply = () =>
    importMut.mutate(
      { text, mode, dryRun: false },
      {
        onSuccess: () => {
          toast.success(t("imported"));
          setPreview(null);
          setText("");
          setFileName("");
          utils.invalidate();
        },
      },
    );

  return (
    <div className="grid md:grid-cols-2 gap-5 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>{t("export")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">{t("exportText")}</p>
          <Button onClick={download} disabled={exportQuery.isFetching}>
            {t("download")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("import")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">{t("importText")}</p>
          <input type="file" accept="application/json,.json" className="text-sm" onChange={(e) => onFile(e.target.files?.[0])} />
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="mode" checked={mode === "merge"} onChange={() => setMode("merge")} /> {t("merge")}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} /> {t("replace")}
            </label>
          </div>
          <p className="text-xs text-slate-500">{mode === "merge" ? t("mergeHint") : t("replaceHint")}</p>

          {preview && (
            <div className="rounded-md border border-slate-200 p-3 text-sm space-y-2">
              <div className="font-medium">{fileName}</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(preview.counts).map(([k, v]) => (
                  <Badge key={k} variant="outline">
                    {t(`counts.${k}`)}: {v}
                  </Badge>
                ))}
              </div>
              {preview.problems.length > 0 ? (
                <div>
                  <div className="text-red-700 font-medium">{t("problems", { n: preview.problems.length })}</div>
                  <ul className="text-xs text-slate-600 font-mono max-h-40 overflow-auto list-disc pl-4">
                    {preview.problems.slice(0, 50).map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <Button onClick={apply} disabled={importMut.isPending} variant={mode === "replace" ? "destructive" : "default"}>
                  {mode === "replace" ? t("applyReplace") : t("applyMerge")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
