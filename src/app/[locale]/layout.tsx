import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/routing";
import { Toaster } from "@/components/ui/sonner";
import { TRPCProvider } from "@/trpc/provider";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <TRPCProvider>
        {children}
        <Toaster richColors position="bottom-right" />
      </TRPCProvider>
    </NextIntlClientProvider>
  );
}
