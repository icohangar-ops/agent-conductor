## Context

See proposal.md — Why. Conductor already has three capability groups
(contract, skills, decision). CHP R0 (`evaluate_r0_gate`) and
`SessionStatus.REQUIRES_HUMAN_VERIFICATION` are the decision primitives.
`src/lib/resilience` already vendors timeout/abort error kinds. No
clearance or spend-mandate package exists in-tree; this change adds a
module (not a package) that extends those gates rather than a parallel
policy engine. Vendor CHP stays byte-identical.

## Goals / Non-Goals

**Goals:**

- Every model/tool spend path in the new code goes through authorize
  (reserve) then commit (settle); missing clearance fail-closes.
- Kill switch is process-local state the model cannot talk past.
- Token/cost math is deterministic, documented as approximate, and
  injectable for tests.
- High-impact tools require human approval plus CHP R0 when a gate is wired.

**Non-Goals:**

- Persisting ledgers across MCP process restarts (in-memory is the v0
  store; tenant/day resets with the process or UTC day, whichever first).
- Calling provider billing APIs or counting real tokenizer output.
- Executing the underlying model/tool — Conductor authorizes and
  records; the client performs the call.
- Rewriting CHP in TypeScript or editing `engine/vendor/cme/`.

## Decisions

1. **Module, not package.** `src/budget/` sits beside `src/contract/` and
   `src/skills/`. Names (`SpendMandate`, `Clearance`) are local types, not
   a new `@cubiczan/*` publish.

2. **Compose CHP, don't fork it.** Ceiling math lives in TypeScript
   (stateful across MCP calls). High-impact authorize calls the existing
   `r0_gate`. Optional `funded` on `decision_gate` adds a `Funded`
   criterion in `bridge.py` without touching vendored `gates.py`.

3. **Two-phase spend.** `authorize` fail-closes and reserves the
   estimate; `commit` requires the clearance id and settles actuals.
   Commit without authorize is rejected. Underestimate on settle trips a
   hard stop so the next authorize cannot continue (the only residual
   overshoot is one already-executed call).

4. **Approximate estimator.** Tokens = `ceil(chars / 4)`. Class rates
   follow CHP `ModelTier` names (`small` / `mid` / `high` / `frontier`)
   with documented USD-per-million defaults. Clients may pass actual
   tokens/USD on commit.

5. **Fail closed on missing policy.** A run with no finite ceilings, an
   unknown run id, NaN/negative money, or a tripped kill switch returns
   `HALT`. Zero is a valid ceiling (nothing authorized).

6. **Contract convention.** Optional AGENTS.md section `Spend mandate`
   (aliases: spend cap / cost ceiling / budget ceiling) compiles into
   `contract.spendMandate`. `run_begin` can load it from a path or take
   explicit overrides.

## Risks / Trade-offs

- [In-memory ledger dies with the process] → Documented; sufficient for
  a single MCP session. Persistence is a later change.
- [Char/4 ≠ provider tokens] → Marked `approximate: true`; commit can
  record actuals; authorize still bounds the estimate.
- [Client ignores HALT and calls the model anyway] → Conductor cannot
  interpose on the client's LLM socket; the control model is "no silent
  overspend path **in the new code**" plus an operator kill that refuses
  further clearances.
