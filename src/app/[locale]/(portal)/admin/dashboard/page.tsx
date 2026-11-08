import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { trpc } from "@/trpc/server";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Section({ title, items, tone = "amber" }: { title: string; items: React.ReactNode[]; tone?: "amber" | "red" }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className={cn("font-medium", tone === "red" ? "text-red-700" : "text-amber-700")}>{title}</div>
      <ul className="text-slate-600 list-disc pl-5">
        {items.slice(0, 15)}
        {items.length > 15 && <li>…</li>}
      </ul>
    </div>
  );
}

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("dashboard");
  const tEnum = await getTranslations("enums");
  const data = await trpc.stats.dashboard();
  const base = `/${locale}/admin`;

  const tiles: [string, number][] = [
    [t("totals.teachers"), data.totals.teachers],
    [t("totals.homeGroups"), data.totals.homeGroups],
    [t("totals.students"), data.totals.students],
    [t("totals.bands"), data.totals.bands],
    [t("totals.lessons"), data.totals.lessons],
    [t("totals.periods"), data.totals.periods],
  ];

  const w = data.warnings;
  const warningCount =
    w.vacancies.length + w.badShapes.length + w.emptyHomeGroups.length + (w.studentsWithoutGroup > 0 ? 1 : 0) + w.coverage.length + w.pupilsOutside.length + w.bandProblems.length;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {tiles.map(([label, value]) => (
          <Card key={label} className="py-3">
            <CardContent className="px-4">
              <div className="text-2xl font-semibold text-slate-800">{value}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle>
              {t("warnings.title")} {warningCount > 0 && <Badge variant="destructive">{warningCount}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {warningCount === 0 && <p className="text-slate-500">{t("warnings.none")}</p>}
            <Section
              title={t("warnings.coverage", { n: w.coverage.length })}
              tone="red"
              items={w.coverage.map((c) => (
                <li key={c.id}>
                  <Link className="underline" href={`${base}/home-groups/${c.homeGroupId}`}>{c.label}</Link>: {t("warnings.coverageItem", { n: c.uncovered })}
                </li>
              ))}
            />
            <Section
              title={t("warnings.bandProblems", { n: w.bandProblems.length })}
              tone="red"
              items={w.bandProblems.map((b) => (
                <li key={b.id}>
                  <Link className="underline" href={`${base}/bands/${b.id}`}>{b.name}</Link>
                  {b.periodMismatch && ` — ${t("warnings.periodMismatch")}`}
                  {b.inTwoOptions > 0 && ` — ${t("warnings.inTwoOptions", { n: b.inTwoOptions })}`}
                </li>
              ))}
            />
            <Section title={t("warnings.vacancies", { n: w.vacancies.length })} items={w.vacancies.map((v) => <li key={v.id}>{v.label} ({v.periods})</li>)} />
            <Section
              title={t("warnings.badShapes", { n: w.badShapes.length })}
              tone="red"
              items={w.badShapes.map((v) => (
                <li key={v.id}>
                  {v.label}: {v.shape} ≠ {v.periods}
                </li>
              ))}
            />
            <Section title={t("warnings.pupilsOutside", { n: w.pupilsOutside.length })} tone="red" items={w.pupilsOutside.map((v) => <li key={v.id}>{v.label} ({v.n})</li>)} />
            <Section title={t("warnings.emptyHomeGroups", { n: w.emptyHomeGroups.length })} items={w.emptyHomeGroups.map((g) => <li key={g.id}>{g.name}</li>)} />
            {w.studentsWithoutGroup > 0 && <div className="font-medium text-amber-700">{t("warnings.studentsWithoutGroup", { n: w.studentsWithoutGroup })}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("groups.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-500 text-left sticky top-0 bg-white">
                  <tr>
                    <th className="py-1 pr-2">{t("groups.name")}</th>
                    <th className="py-1 pr-2">{t("groups.year")}</th>
                    <th className="py-1 pr-2 text-right">{t("groups.students")}</th>
                    <th className="py-1 text-right">{t("groups.periods")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.homeGroups.map((g) => (
                    <tr key={g.id} className="border-t border-slate-100">
                      <td className="py-1 pr-2">
                        <Link className="hover:underline" href={`${base}/home-groups/${g.id}`}>{g.name}</Link>
                      </td>
                      <td className="py-1 pr-2 text-slate-500">{tEnum(`year.${g.year}`)} · {tEnum(`direction.${g.direction}`)}</td>
                      <td className="py-1 pr-2 text-right">{g.students}</td>
                      <td className="py-1 text-right">{g.periods}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>{t("load.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-left">
                <tr>
                  <th className="py-1 pr-2">{t("load.teacher")}</th>
                  <th className="py-1 pr-2">{t("load.department")}</th>
                  <th className="py-1 pr-2 text-right">{t("load.obligation")}</th>
                  <th className="py-1 pr-2 text-right">{t("load.reduction")}</th>
                  <th className="py-1 pr-2 text-right">{t("load.target")}</th>
                  <th className="py-1 pr-2 text-right">{t("load.assigned")}</th>
                  <th className="py-1 text-right">{t("load.diff")}</th>
                </tr>
              </thead>
              <tbody>
                {data.teachers.map((r) => (
                  <tr key={r.id} className={cn("border-t border-slate-100", !r.active && "text-slate-400")}>
                    <td className="py-1 pr-2">
                      <Link className="hover:underline" href={`${base}/teachers/${r.id}`}>{r.name}</Link>
                    </td>
                    <td className="py-1 pr-2 text-slate-500">{r.department}</td>
                    <td className="py-1 pr-2 text-right">{r.obligation}</td>
                    <td className="py-1 pr-2 text-right">{r.reduction}</td>
                    <td className="py-1 pr-2 text-right">{r.target}</td>
                    <td className="py-1 pr-2 text-right">{r.assigned}</td>
                    <td className={cn("py-1 text-right font-medium", r.status === "ok" ? "text-emerald-700" : r.status === "under" ? "text-amber-700" : "text-red-700")}>
                      {r.diff > 0 ? `+${r.diff}` : r.diff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
