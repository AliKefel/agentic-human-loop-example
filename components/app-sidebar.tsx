"use client";

import { Brain, Inbox, LayoutDashboard, Presentation, ScrollText, Siren, SlidersHorizontal } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarRail } from "@/components/ui/sidebar";
import { NavLink } from "@/components/nav-link";

export function AppSidebar({ pendingApprovals, openIncidents }: { pendingApprovals: number; openIncidents: number }) {
  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4">
        <div className="text-lg font-semibold">🦈 The Tank</div>
        <div className="text-xs text-sidebar-foreground/70">Deep Water Ventures</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operate</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavLink href="/" label="Fund Overview" icon={LayoutDashboard} />
              <NavLink href="/pitches" label="Pitches" icon={Presentation} />
              <NavLink href="/queue" label="Review Queue" icon={Inbox} badge={pendingApprovals} />
              <NavLink href="/incidents" label="Incidents" icon={Siren} badge={openIncidents} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Govern</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavLink href="/harness" label="Harness" icon={SlidersHorizontal} />
              <NavLink href="/audit" label="Audit Log" icon={ScrollText} />
              <NavLink href="/memory" label="Memory" icon={Brain} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
