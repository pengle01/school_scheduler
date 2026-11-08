import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/PageHeader";
import { LessonsTable } from "./LessonsTable";

export default async function LessonsPage() {
  const t = await getTranslations("lessons");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <LessonsTable />
    </>
  );
}
