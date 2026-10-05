import type { RunState } from "@/lib/types";

export function initialRunState(): RunState {
  return { shark_outputs: {}, shark_failures: {}, founder_asked: false, founder_answers: [], memories_used: [] };
}
