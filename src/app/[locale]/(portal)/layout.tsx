import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col bg-slate-50">
        <Header />
        <main className="flex-1 p-4 md:p-6 w-full min-w-0">{children}</main>
      </div>
    </div>
  );
}
