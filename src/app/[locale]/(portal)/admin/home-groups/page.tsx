import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/PageHeader";
import { HomeGroupsTable } from "./HomeGroupsTable";

export default async function HomeGroupsPage() {
  const t = await getTranslations("homeGroups");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <HomeGroupsTable />
    </>
  );
}
