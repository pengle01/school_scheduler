import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/PageHeader";
import { StudentsTable } from "./StudentsTable";

export default async function StudentsPage() {
  const t = await getTranslations("students");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <StudentsTable />
    </>
  );
}
