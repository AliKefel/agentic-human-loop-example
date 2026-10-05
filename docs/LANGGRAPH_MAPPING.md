# LangGraph mapping

How The Tank's hand-rolled harness corresponds to LangGraph concepts.

| LangGraph | The Tank |
|---|---|
| `StateGraph` | Status map in `lib/harness/machine.ts` (allowed transitions between run statuses) |
| Node | Handler per status in the run advancer |
| Conditional edge | `policy.decide` (chooses the next status from run state and config) |
| `Send` fan-out | `Promise.allSettled` over the sharks in `sharks.ts` |
| Checkpointer | `checkpoints` table (one row per step, seq-ordered) |
| `interrupt()` | Waiting statuses plus approval actions (human in the loop) |
| `Command(resume=...)` | `decideApproval` / `answerFounder` server actions |
| `thread_id` | `run.id` |
| Store (long-term memory) | `memories` table |
