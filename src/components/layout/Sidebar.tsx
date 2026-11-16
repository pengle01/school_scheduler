"use client";

import { useSyncExternalStore } from "react";
import { SidebarContent } from "./SidebarContent";
import { cn } from "@/lib/utils";

// The desktop sidebar: full width, or a narrow rail of icons. The choice is kept in
// localStorage; useSyncExternalStore reads it without a setState-in-effect.
const KEY = "sidebarCollapsed";
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function write(value: boolean) {
  try {
    window.localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // private window: the choice lasts until reload
  }
  listeners.forEach((fn) => fn());
}

export function Sidebar() {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  return (
    <aside className={cn("hidden md:block shrink-0 sticky top-0 h-screen transition-[width] duration-150", collapsed ? "w-14" : "w-60")}>
      <SidebarContent collapsed={collapsed} onToggle={() => write(!collapsed)} />
    </aside>
  );
}
