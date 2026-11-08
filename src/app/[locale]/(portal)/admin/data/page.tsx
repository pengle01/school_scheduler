import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/PageHeader";
import { ExportImport } from "./ExportImport";

export default async function DataPage() {
  const t = await getTranslations("data");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <ExportImport />
    </>
  );
}
