import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getActingUser, listUsers } from "@/lib/current-user";
import { getNavCounts } from "@/lib/counts";
import { isMockMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const [current, users, counts] = await Promise.all([getActingUser(), listUsers(), getNavCounts()]);
  return (
    <TooltipProvider>
    <SidebarProvider>
      <AppSidebar {...counts} />
      <SidebarInset>
        <Topbar current={current} users={users} mock={isMockMode()} />
        <div className="flex-1 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
    </TooltipProvider>
  );
}
