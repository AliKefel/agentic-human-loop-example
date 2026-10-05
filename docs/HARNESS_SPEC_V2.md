# Harness Spec v2

Fill in every section for your design. Replace the guidance prompts (in italics) with your answers. Keep tables, add rows as needed.

## 1. Product & users

*Who uses The Tank, for what decision, and what does a good outcome look like? Name the users and the cost of a wrong decision.*

## 2. Autonomy level

**Chosen level:** _L0 / L1 / L2 / L3_

**Why:** *Justify the level against the risk of a bad deal and the cost of human review.*

| Level | What the system does alone | Where a human steps in | Evidence (run ids, numbers) |
|---|---|---|---|
| L0 | | | |
| L1 | | | |
| L2 | | | |
| L3 | | | |

## 3. Approval matrix

*Who must approve what? Cover every combination you allow.*

| Role | Amount range | Kind (invest / pass / modify) | Approval needed? | Rationale |
|---|---|---|---|---|
| | | | | |

## 4. Permission matrix

*What may each agent call and read? Least privilege: justify every grant.*

| Agent | Tools | Data | Denied (and why) |
|---|---|---|---|
| | | | |

## 5. Trust boundaries

- **Untrusted input:** *Which inputs can an attacker control (pitch text, founder replies)? How does the harness keep them from acting as instructions?*
- **No agent sends offers:** *Which component is the only thing allowed to send an offer, and what check precedes it?*
- **Demo RLS tradeoff:** *This demo uses permissive RLS and a server-side secret key. What would you change in production?*

## 6. Reliability budgets

| Control | Value | Why this value | What happens when exceeded |
|---|---|---|---|
| Timeout per call | | | |
| Retries and backoff | | | |
| Fallback model | | | |
| Token / cost budget | | | |
| Max steps | | | |
| Max replans | | | |

## 7. Exception & escalation paths

*For each failure (shark timeout, bad JSON, budget exhausted, disagreement, revenue mismatch, injection), say what the system does, who is notified, and the SLA.*

| Trigger | Automatic response | Escalates to | SLA |
|---|---|---|---|
| | | | |

## 8. Incident ownership & handoff

*Who owns an incident from open to resolved? What must a handoff note contain so the next person can act without asking?*

## 9. What-if evidence

*Show that your thresholds are justified. Paste screenshots of the simulator and the numbers behind them.*

| Change tested | Before | After | Screenshot / link | Conclusion |
|---|---|---|---|---|
| | | | | |

## 10. Open risks

| Risk | Likelihood | Impact | Mitigation or owner |
|---|---|---|---|
| | | | |
