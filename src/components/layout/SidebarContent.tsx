"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Boxes,
  GraduationCap,
  Layers,
  CalendarRange,
  Scale,
  Database,
  CalendarClock,
  DoorOpen,
  CalendarDays,
  LifeBuoy,
  Grid3x3,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  key: string; // messages: nav.<key>
  href: string; // relative to /<locale>/admin/
  icon: React.ComponentType<{ className?: string }>;
}

// Keys must exist under `nav` in messages/el.json and messages/en.json.
export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "dashboard", icon: LayoutDashboard },
  { key: "teachers", href: "teachers", icon: Users },
  { key: "subjects", href: "subjects", icon: BookOpen },
  { key: "homeGroups", href: "home-groups", icon: Boxes },
  { key: "students", href: "students", icon: GraduationCap },
  { key: "lessons", href: "lessons", icon: CalendarRange },
  { key: "bands", href: "bands", icon: Layers },
  { key: "support", href: "support", icon: LifeBuoy },
  { key: "zoneGrid", href: "zone-grid", icon: Grid3x3 },
  { key: "rooms", href: "rooms", icon: DoorOpen },
  { key: "timetable", href: "timetable", icon: CalendarDays },
  { key: "rules", href: "rules", icon: Scale },
  { key: "settings", href: "settings", icon: CalendarClock },
  { key: "data", href: "data", icon: Database },
];

// collapsed: icons only (labels become tooltips). onToggle: shows the collapse button (desktop sidebar).
export function SidebarContent({ onNavigate, collapsed = false, onToggle }: { onNavigate?: () => void; collapsed?: boolean; onToggle?: () => void }) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full bg-emerald-950">
      <div className={cn("flex items-center gap-3 py-5 border-b border-emerald-900", collapsed ? "justify-center px-2" : "px-5")}>
        <div className="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg bg-lime-400">
          <CalendarRange className="w-5 h-5 text-emerald-900" />
        </div>
        {!collapsed && <span className="font-semibold text-white text-sm leading-tight">{tCommon("appName")}</span>}
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_ITEMS.map((item) => {
          const href = `/${locale}/admin/${item.href}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={href}
              onClick={onNavigate}
              title={collapsed ? t(item.key) : undefined}
              aria-label={collapsed ? t(item.key) : undefined}
              className={cn(
                "flex items-center gap-3 mx-2 my-0.5 py-2 rounded-lg text-sm transition-colors",
                collapsed ? "justify-center px-0" : "px-3",
                active ? "bg-emerald-800 text-white font-medium" : "text-emerald-200 hover:bg-emerald-900 hover:text-white",
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && t(item.key)}
            </Link>
          );
        })}
      </nav>
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          title={tCommon(collapsed ? "expandSidebar" : "collapseSidebar")}
          aria-label={tCommon(collapsed ? "expandSidebar" : "collapseSidebar")}
          className={cn("flex items-center gap-3 mx-2 my-2 py-2 rounded-lg text-sm text-emerald-200 hover:bg-emerald-900 hover:text-white", collapsed ? "justify-center px-0" : "px-3")}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4 shrink-0" /> : <PanelLeftClose className="w-4 h-4 shrink-0" />}
          {!collapsed && tCommon("collapseSidebar")}
        </button>
      )}
    </div>
  );
}
