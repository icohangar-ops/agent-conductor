# AGENTS.md — Safe autonomous run

Example operating manual for a bounded agent loop. Conductor compiles the
spend mandate below and fail-closes when a ceiling is hit. The model is
not asked whether to continue.

## Mission

Demonstrate a fail-closed autonomous run: preview context cost, authorize
each model/tool call against hard ceilings, pause on high-impact tools,
and stop cleanly at the budget or turn cap.

## Spend mandate

Approximate preview uses `ceil(chars/4)` tokens and documented class rates
(see the Agent Conductor README). These numbers are ceilings, not targets.

| Ceiling | Limit |
|---------|-------|
| run | 0.0004 |
| tenant-day | 1.00 |
| tool-default | 0.0002 |
| tool:Bash | 0.0001 |
| max-turns | 20 |
| max-model-class | small |
| preferred-model-class | small |

### High-impact tools

- Bash

## Engineering rules

### Non-negotiables

1. **Fail closed** — a HALT or APPROVE_REQUIRED from `run_authorize` ends the loop. Do not retry with a higher class or a guessed clearance id.
2. **Authorize then commit** — never treat a model/tool call as spent unless `run_commit` settled a real clearance.
3. **Kill switch is operator-owned** — `run_kill` does not consult the model.

## Code change checklist

```bash
npm test
```

## Out of scope

- Live provider billing APIs
- Persisting the ledger across MCP process restarts
