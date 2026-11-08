"use client";

import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { errorKey } from "@/lib/clientErrors";

export function useErrorToast() {
  const t = useTranslations("errors");
  return (err: unknown) => toast.error(t(errorKey(err)));
}
