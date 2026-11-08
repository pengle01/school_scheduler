import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/PageHeader";
import { SupportTable } from "./SupportTable";

export default async function SupportPage() {
  const t = await getTranslations("support");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <SupportTable />
    </>
  );
}
