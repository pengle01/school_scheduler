import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/PageHeader";
import { RoomsTable } from "./RoomsTable";

export default async function RoomsPage() {
  const t = await getTranslations("rooms");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <RoomsTable />
    </>
  );
}
