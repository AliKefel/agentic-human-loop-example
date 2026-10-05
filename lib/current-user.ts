import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import type { User } from "@/lib/types";
import { PARTNER_ID, SEED_USERS } from "@/lib/mock/seed-users";

export const ACTING_USER_COOKIE = "acting_user_id";
export const DEFAULT_USER_ID = PARTNER_ID;

// In-code copy of the seed users so the shell never crashes if the DB is unreachable.
export const FALLBACK_USERS: User[] = SEED_USERS;

export function resolveActingUser(users: User[], cookieId: string | undefined): User {
  return (
    users.find((u) => u.id === cookieId) ??
    users.find((u) => u.id === DEFAULT_USER_ID) ??
    FALLBACK_USERS[1]
  );
}

export function assertKnownUser(users: User[], id: string): User {
  const u = users.find((x) => x.id === id);
  if (!u) throw new Error("Unknown user");
  return u;
}

export async function listUsers(): Promise<User[]> {
  try {
    const { data, error } = await createAdminClient().from("users").select("*").order("id");
    if (error || !data || data.length === 0) {
      console.warn("listUsers: using fallback users", error?.message ?? "no rows");
      return FALLBACK_USERS;
    }
    return data as User[];
  } catch (e) {
    console.warn("listUsers: using fallback users", e);
    return FALLBACK_USERS;
  }
}

export async function getActingUser(): Promise<User> {
  const cookieId = (await cookies()).get(ACTING_USER_COOKIE)?.value;
  return resolveActingUser(await listUsers(), cookieId);
}
