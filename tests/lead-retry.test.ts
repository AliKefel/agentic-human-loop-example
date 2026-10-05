import { describe, expect, it, vi } from "vitest";
import type { LlmRequest } from "@/lib/llm/client";

// Override only the lead plan call's first primary attempt with malformed text; everything else uses the real mock.
vi.mock("@/lib/llm/client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/llm/client")>();
  return {
    ...actual,
    callLlm: async (req: LlmRequest) => {
      const res = await actual.callLlm(req);
      if (req.pitchSlug === "brewbot" && req.agent === "lead" && req.purpose === "plan" && req.attempt === 1) return { ...res, text: "not json {" };
      if (req.pitchSlug === "kidcode" && req.agent === "lead" && req.purpose === "triage" && req.model === "claude-sonnet-5-5") return { ...res, text: "nope" };
      return res;
    },
  };
});

const { MemoryRepo } = await import("@/lib/harness/repo-memory");
const { createRun } = await import("@/lib/harness/runs");
const { runToRest } = await import("@/lib/harness/machine");
const { GP_ID, SEED_USERS } = await import("@/lib/mock/seed-users");
const GP = SEED_USERS.find((u) => u.id === GP_ID)!;

async function runPitch(slug: string) {
  const repo = new MemoryRepo();
  const pitch = await repo.getPitchBySlug(slug);
  const run = await createRun(repo, { pitchId: pitch.id, user: GP });
  return { repo, run: await runToRest(repo, run.id) };
}

describe("lead calls use the reliability layer", () => {
  it("plan schema_fail on attempt 1, retry ok → run continues", async () => {
    const { repo, run } = await runPitch("brewbot");
    const plan = repo.agentCalls.filter((a) => a.run_id === run.id && a.purpose === "plan");
    expect(plan.map((a) => [a.status, a.attempt, a.fallback_used])).toEqual([["schema_fail", 1, false], ["ok", 2, false]]);
    expect(run.status).toBe("passed");
    expect(run.plan?.sharks).toContain("skeptic");
  });

  it("triage failing on every primary attempt falls back to the fallback model", async () => {
    const { repo, run } = await runPitch("kidcode");
    const triage = repo.agentCalls.filter((a) => a.run_id === run.id && a.purpose === "triage");
    expect(triage.map((a) => a.status)).toEqual(["schema_fail", "schema_fail", "schema_fail", "ok"]);
    expect(triage.map((a) => a.fallback_used)).toEqual([false, false, false, true]);
    expect(triage[3].model).toBe("claude-haiku-4-5-20251001");
    expect(run.status).toBe("passed");
  });
});
