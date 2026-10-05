"use client";

import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ModeBadge } from "@/components/mode-badge";
import { RoleSwitcher } from "@/components/role-switcher";
import type { User } from "@/lib/types";

const TITLES: Record<string, string> = {
  "/": "Fund Overview",
  "/pitches": "Pitches",
  "/queue": "Review Queue",
  "/incidents": "Incidents",
  "/harness": "Harness",
  "/audit": "Audit Log",
  "/memory": "Memory",
};

function titleFor(pathname: string) {
  if (pathname.startsWith("/runs/")) return "Run";
  return TITLES[pathname] ?? "The Tank";
}

export function Topbar({ current, users, mock }: { current: User; users: User[]; mock: boolean }) {
  const pathname = usePathname();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <h1 className="text-base font-semibold">{titleFor(pathname)}</h1>
      <div className="ml-auto flex items-center gap-3">
        <ModeBadge mock={mock} />
        <RoleSwitcher current={current} users={users} />
      </div>
    </header>
  );
}
