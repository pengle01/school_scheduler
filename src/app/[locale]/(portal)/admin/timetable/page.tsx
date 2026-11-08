import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/PageHeader";
import { TimetableViewer } from "./TimetableViewer";

export default async function TimetablePage() {
  const t = await getTranslations("timetable");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <TimetableViewer />
    </>
  );
}
