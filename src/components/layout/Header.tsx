"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { routing, type Locale } from "@/i18n/routing";
import { SidebarContent } from "./SidebarContent";
import { cn } from "@/lib/utils";

function LocaleSwitch() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const switchTo = (next: Locale) => {
    if (next === locale) return;
    const rest = pathname.replace(/^\/(el|en)(?=\/|$)/, "");
    router.push(`/${next}${rest || ""}`);
  };

  return (
    <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs" role="group" aria-label="Language">
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          className={cn("px-2.5 py-1 uppercase", l === locale ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function Header({ title }: { title?: string }) {
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="flex items-center gap-3 h-14 px-4 border-b border-slate-200 bg-white sticky top-0 z-20">
        <button
          type="button"
          className="md:hidden p-2 rounded-md hover:bg-slate-100"
          aria-label={tCommon("openMenu")}
          onClick={() => setOpen(true)}
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="font-semibold text-slate-800 truncate">{title ?? tCommon("appName")}</h1>
        <div className="ml-auto">
          <LocaleSwitch />
        </div>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 shadow-xl">
            <button
              type="button"
              className="absolute top-4 right-3 p-1 text-emerald-200 hover:text-white"
              aria-label={tCommon("closeMenu")}
              onClick={() => setOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
