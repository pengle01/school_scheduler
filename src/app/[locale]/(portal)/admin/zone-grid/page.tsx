import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/PageHeader";
import { ZoneGrid } from "./ZoneGrid";

export default async function ZoneGridPage() {
  const t = await getTranslations("zoneGrid");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <ZoneGrid />
    </>
  );
}
