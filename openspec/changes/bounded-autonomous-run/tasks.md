## 1. Budget control plane

- [x] 1.1 Add `src/budget/` types, approximate estimator, kill switch, model router, and ledgered controller
- [x] 1.2 Fail-closed authorize/commit with per-run, per-tool, per-tenant/day ceilings and turn cap
- [x] 1.3 Compose high-impact tools with optional CHP R0 + human approval

## 2. Contract and CHP composition

- [x] 2.1 Parse optional AGENTS.md `Spend mandate` into `contract.spendMandate`
- [x] 2.2 Optional `funded` criterion on `decision_gate` / Python `r0_gate` (vendor untouched)

## 3. MCP tools and example

- [x] 3.1 Expose `run_preflight`, `run_begin`, `run_authorize`, `run_commit`, `run_approve`, `run_kill`, `run_status`
- [x] 3.2 Add `examples/safe-autonomous-run/` recipe (AGENTS.md + skill + driver)

## 4. Tests and docs

- [x] 4.1 Tests for ceiling, kill switch, missing clearance, high-impact pause, recipe stop
- [x] 4.2 README control-model section; ARCHITECTURE / AGENTS.md updates
