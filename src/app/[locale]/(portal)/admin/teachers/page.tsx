import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/PageHeader";
import { TeachersTable } from "./TeachersTable";

export default async function TeachersPage() {
  const t = await getTranslations("teachers");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <TeachersTable />
    </>
  );
}
