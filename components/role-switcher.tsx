"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setActingUser } from "@/app/actions/role";
import { money } from "@/lib/format";
import type { Role, User } from "@/lib/types";

const ROLE_LABEL: Record<Role, string> = { analyst: "Analyst", partner: "Partner", general_partner: "General Partner" };
const initials = (name: string) => name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const limitLabel = (u: User) => (u.approval_limit <= 0 ? "No approval authority" : u.approval_limit >= 1e9 ? "Unlimited approvals" : `Approves up to ${money(u.approval_limit)}`);

function UserAvatar({ user }: { user: User }) {
  return (
    <Avatar size="sm">
      <AvatarFallback style={{ backgroundColor: user.avatar_color, color: "#04121f" }}>{initials(user.name)}</AvatarFallback>
    </Avatar>
  );
}

export function RoleSwitcher({ current, users }: { current: User; users: User[] }) {
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto gap-2 px-2 py-1" disabled={pending} data-testid="role-switcher">
          <UserAvatar user={current} />
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-medium">{current.name}</span>
            <span className="block text-xs text-muted-foreground">{ROLE_LABEL[current.role]}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Acting as</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {users.map((u) => (
          <DropdownMenuItem key={u.id} onSelect={() => start(async () => { try { await setActingUser(u.id); } catch (e) { console.error(e); toast.error("Could not switch user"); } })} className="gap-2">
            <UserAvatar user={u} />
            <span className="flex-1 leading-tight">
              <span className="block text-sm">{u.name}</span>
              <span className="block text-xs text-muted-foreground">{ROLE_LABEL[u.role]} · {limitLabel(u)}</span>
            </span>
            {u.id === current.id ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
