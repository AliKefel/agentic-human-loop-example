"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTING_USER_COOKIE } from "@/lib/current-user";

export async function setActingUser(userId: string): Promise<void> {
  (await cookies()).set(ACTING_USER_COOKIE, userId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
