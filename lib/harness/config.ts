/**
 * Versioned harness config (SPEC §5.6, M10): validation and publishing.
 * Publishing never edits in place — it creates version N+1 and makes it the active config.
 * Runs snapshot `config_version` at creation (createRun), so older runs keep their version.
 */
import { HarnessConfigSchema } from "@/lib/schemas";
import { TOOL_NAMES } from "@/lib/tools/catalog";
import { diffConfigs } from "@/lib/config-diff";
import type { ConfigDraft, HarnessConfig, User } from "@/lib/types";
import type { Repo } from "./repo";
import { actor } from "./audit";
import { ForbiddenError, ValidationError } from "./errors";
import { CONFIG_AGENTS, DATA_SCOPES } from "./config-constants";

export { CONFIG_AGENTS, DATA_SCOPES };

/** Strips the version metadata, leaving the editable draft. */
export function toDraft(c: HarnessConfig): ConfigDraft {
  const { autonomy_level, thresholds, budgets, reliability, permissions, notes } = structuredClone(c);
  return { autonomy_level, thresholds, budgets, reliability, permissions, notes: notes ?? null };
}

/** Schema + semantic checks; throws ValidationError listing every problem. Returns the parsed draft. */
export function validateConfigDraft(input: unknown): ConfigDraft {
  const parsed = HarnessConfigSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`).join("; ");
    throw new ValidationError(`Invalid config — ${msg}`);
  }
  const d = parsed.data;
  const t = d.thresholds;
  const errs: string[] = [];
  const positive = (path: string, v: number) => { if (!Number.isFinite(v) || v <= 0) errs.push(`${path} must be a positive number`); };
  const intIn = (path: string, v: number, lo: number, hi: number) => { if (!Number.isInteger(v) || v < lo || v > hi) errs.push(`${path} must be a whole number from ${lo} to ${hi}`); };

  intIn("autonomy_level", d.autonomy_level, 0, 3);
  for (const k of ["fund_max_check", "auto_max_amount", "auto_max_equity", "auto_min_score", "disagreement_spread", "partner_limit"] as const) positive(`thresholds.${k}`, t[k]);
  for (const k of ["approval", "exception", "escalation"] as const) positive(`thresholds.sla_hours.${k}`, t.sla_hours[k]);
  if (t.partner_limit > t.fund_max_check) errs.push("thresholds.partner_limit must not exceed thresholds.fund_max_check");
  if (t.auto_max_equity > 100) errs.push("thresholds.auto_max_equity must be at most 100");
  for (const k of ["max_tokens", "max_usd", "est_tokens_per_shark", "max_steps"] as const) positive(`budgets.${k}`, d.budgets[k]);
  intIn("budgets.max_replans", d.budgets.max_replans, 0, 10);
  intIn("reliability.retries", d.reliability.retries, 0, 5);
  intIn("reliability.timeout_ms", d.reliability.timeout_ms, 1000, 120000);
  if (d.reliability.backoff_ms.some((b) => !Number.isFinite(b) || b < 0)) errs.push("reliability.backoff_ms values must be ≥ 0");
  if (!d.reliability.primary_model.trim() || !d.reliability.fallback_model.trim()) errs.push("reliability models must not be empty");

  for (const a of CONFIG_AGENTS) if (!d.permissions[a]) errs.push(`permissions.${a} is missing`);
  for (const [agent, p] of Object.entries(d.permissions)) {
    if (!(CONFIG_AGENTS as string[]).includes(agent)) errs.push(`permissions: unknown agent "${agent}"`);
    for (const tool of p.tools) if (!(TOOL_NAMES as string[]).includes(tool)) errs.push(`permissions.${agent}.tools: unknown tool "${tool}"`);
    for (const s of p.data) if (!(DATA_SCOPES as readonly string[]).includes(s)) errs.push(`permissions.${agent}.data: unknown data scope "${s}"`);
  }
  if (d.notes != null && d.notes.length > 2000) errs.push("notes must be at most 2000 characters");
  if (errs.length) throw new ValidationError(`Invalid config — ${errs.join("; ")}`);
  return d;
}

/** GP only (server-enforced). Validates, publishes version max+1 as active, audits config.published {version, diff}. */
export async function publishConfig(repo: Repo, draft: ConfigDraft, user: User): Promise<HarnessConfig> {
  if (user.role !== "general_partner") {
    await repo.audit({ ...actor(user), action: "config.denied", entity: "harness_config", details: { reason: "only a General Partner can publish a harness config" } });
    throw new ForbiddenError("Only a General Partner can publish a harness config");
  }
  const valid = validateConfigDraft(draft);
  const previous = await repo.getActiveConfig();
  const created = await repo.insertConfigActivate({ ...valid, notes: valid.notes ?? null }, user.id);
  const diff = diffConfigs(previous, created);
  await repo.audit({ ...actor(user), action: "config.published", entity: "harness_config", entity_id: created.id, details: { version: created.version, previous_version: previous.version, diff } });
  return created;
}
