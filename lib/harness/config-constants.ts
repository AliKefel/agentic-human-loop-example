/**
 * Data-free config constants, safe to import from client components.
 * (lib/harness/config.ts pulls in the tool executor and repo types; keep this file import-light.)
 */
import type { AgentId } from "@/lib/types";

export const CONFIG_AGENTS: AgentId[] = ["lead", "market", "finance", "product", "skeptic"];
export const DATA_SCOPES = ["pitch", "market", "financials", "deals", "portfolio", "memories"] as const;
