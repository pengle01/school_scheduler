import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/PageHeader";
import { RulesTable } from "./RulesTable";

export default async function RulesPage() {
  const t = await getTranslations("rules");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <RulesTable />
    </>
  );
}
