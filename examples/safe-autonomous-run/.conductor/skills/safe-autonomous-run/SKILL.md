---
name: safe-autonomous-run
description: Run a bounded autonomous loop with spend ceilings, preflight cost preview, high-impact pause-and-approve, and an operator kill switch. Use when starting a safe autonomous run, hitting a budget ceiling, or aborting a looping agent.
version: 0.1.0
tools: [run_preflight, run_begin, run_authorize, run_commit, run_approve, run_kill, run_status]
---

# Safe autonomous run

Drive a Conductor-bounded loop. The controller — not the model — decides
when spend stops.

## Steps

1. `run_preflight` with the system rules, history, tool schemas, and user
   prompt. Treat the USD figure as approximate (`ceil(chars/4)`).
2. `run_begin` with `path` pointing at this example (or pass explicit
   `runUsd` / `tenantDayUsd`). A missing mandate is a HALT.
3. For each model turn: `run_authorize` (`kind=model`) → perform the call
   only on PASS → `run_commit` with actual tokens/USD if the provider
   reported them.
4. For `Bash` (high-impact): expect `APPROVE_REQUIRED`. An operator runs
   `decision_gate` / `run_approve` with solvable, scoped, valid, worth_it
   before the next authorize.
5. On HALT (`run_ceiling`, `tenant_day_ceiling`, `stuck_loop`,
   `kill_switch`, `hard_stop`) stop. Do not invent a new run id to bypass
   the ceiling.
6. `run_kill` at any time aborts further authorizes without asking the
   model.

## Constraints

- Never call `run_commit` without a clearance id from `run_authorize`.
- Never raise `maxModelClass` after a HALT to "finish the task".
