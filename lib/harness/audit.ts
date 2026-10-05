import type { User } from "@/lib/types";

export const SYSTEM = { actor_id: null, actor_role: "system" } as const;

export function actor(u: User) {
  return { actor_id: u.id, actor_role: u.role };
}
