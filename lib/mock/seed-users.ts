import type { User } from "@/lib/types";

export const ANALYST_ID = "00000000-0000-0000-0000-000000000001";
export const PARTNER_ID = "00000000-0000-0000-0000-000000000002";
export const GP_ID = "00000000-0000-0000-0000-000000000003";

// Mirrors supabase/seed.sql users.
export const SEED_USERS: User[] = [
  { id: ANALYST_ID, name: "Avery Analyst", role: "analyst", approval_limit: 0, avatar_color: "#38bdf8" },
  { id: PARTNER_ID, name: "Pat Partner", role: "partner", approval_limit: 250000, avatar_color: "#14b8a6" },
  { id: GP_ID, name: "Gen GP", role: "general_partner", approval_limit: 1e12, avatar_color: "#f59e0b" },
];
