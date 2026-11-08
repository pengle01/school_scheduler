import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/PageHeader";
import { BandsTable } from "./BandsTable";

export default async function BandsPage() {
  const t = await getTranslations("bands");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <BandsTable />
    </>
  );
}
