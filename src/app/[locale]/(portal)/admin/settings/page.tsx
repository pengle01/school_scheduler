import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/PageHeader";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <SettingsForm />
    </>
  );
}
