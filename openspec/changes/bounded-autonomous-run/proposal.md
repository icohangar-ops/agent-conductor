## Why

Always-on agents burn quotas: token overhead is invisible, multi-agent loops
create opaque cost, and nothing fail-closes independently of the model.
Conductor already compiles contracts and gates high-stakes work through CHP;
those gates do not yet carry a spend mandate or an operator kill switch.

## What Changes

- Preflight / dry-run context inspector that breaks estimated tokens and cost
  into system rules, history, tool schemas, and the user prompt (approximate,
  documented).
- Hard budget circuit breaker with per-run, per-tool, and per-tenant/day
  ceilings. Fail closed at the limit. Ledger records before and after every
  model or tool call.
- Pause-and-approve checkpoints for high-impact tools, composed with the
  existing CHP R0 gate (and human approval).
- Independent kill switch / abort that does not rely on the model cooperating.
- Policy-based model routing ledger (chosen class, why, cost estimate) plus a
  hard turn cap against stuck loops.
- Example "safe autonomous run" recipe and tests that hit a ceiling and stop
  cleanly.
- README section documenting the control model.
- Parser convention for an optional `Spend mandate` section on AGENTS.md.
- Optional `funded` criterion on `decision_gate` / `r0_gate` so budget status
  can participate in the existing CHP gate without a side policy engine.

## Capabilities

### New Capabilities

- `bounded-run`: Fail-closed spend mandates, preflight cost preview, ledgered
  authorize/commit, high-impact CHP checkpoints, kill switch, and model routing
  for bounded autonomous runs.

### Modified Capabilities

- (none — this repo has no existing `openspec/specs/` capabilities)

## Impact

- New `src/budget/` module composed by MCP `run_*` tools and `decision_gate`.
- `src/contract/` gains an optional compiled `spendMandate`.
- `engine/bridge.py` may pass an optional `funded` flag through R0 (vendor
  CHP core unchanged).
- Example recipe under `examples/safe-autonomous-run/`.
- README / ARCHITECTURE / this repo's AGENTS.md document the control model.
- No new runtime dependencies.
