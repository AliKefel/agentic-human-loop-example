import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

async function count(table: string, status: string): Promise<number> {
  try {
    const { count, error } = await createAdminClient().from(table).select("*", { count: "exact", head: true }).eq("status", status);
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}

export async function getNavCounts() {
  const [pendingApprovals, openIncidents] = await Promise.all([count("approvals", "pending"), count("incidents", "open")]);
  return { pendingApprovals, openIncidents };
}
