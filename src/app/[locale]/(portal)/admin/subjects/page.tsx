import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/PageHeader";
import { SubjectsTable } from "./SubjectsTable";

export default async function SubjectsPage() {
  const t = await getTranslations("subjects");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <SubjectsTable />
    </>
  );
}
