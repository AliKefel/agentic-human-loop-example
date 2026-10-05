import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import type { User } from "@/lib/types";

export const ACTING_USER_COOKIE = "acting_user_id";
export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000002";

// In-code copy of the seed users so the shell never crashes if the DB is unreachable.
export const FALLBACK_USERS: User[] = [
  { id: "00000000-0000-0000-0000-000000000001", name: "Avery Analyst", role: "analyst", approval_limit: 0, avatar_color: "#38bdf8" },
  { id: DEFAULT_USER_ID, name: "Pat Partner", role: "partner", approval_limit: 250000, avatar_color: "#14b8a6" },
  { id: "00000000-0000-0000-0000-000000000003", name: "Gen GP", role: "general_partner", approval_limit: 1e12, avatar_color: "#f59e0b" },
];

export function resolveActingUser(users: User[], cookieId: string | undefined): User {
  return (
    users.find((u) => u.id === cookieId) ??
    users.find((u) => u.id === DEFAULT_USER_ID) ??
    FALLBACK_USERS[1]
  );
}

export async function listUsers(): Promise<User[]> {
  try {
    const { data, error } = await createAdminClient().from("users").select("*").order("id");
    if (error || !data || data.length === 0) return FALLBACK_USERS;
    return data as User[];
  } catch {
    return FALLBACK_USERS;
  }
}

export async function getActingUser(): Promise<User> {
  const cookieId = (await cookies()).get(ACTING_USER_COOKIE)?.value;
  return resolveActingUser(await listUsers(), cookieId);
}
