---
name: pipeline-scoring
description: Explain and modify scoreDealRisk weights in src/crm.js with matching test updates. Use when changing deal risk scoring, risk labels, or forecast category thresholds in Pipeline Pulse CRM.
version: 0.1.0
tools: [Read, Edit, Bash]
---

# Pipeline Scoring

Workflow for changing the deterministic risk scoring model.

## Steps

1. Read `src/crm.js` — locate `scoreDealRisk(opportunity, account)` and note the
   current factor weights (stale activity, missing next step, contact coverage,
   close-date pressure, deal size, account health).
2. Write or extend tests in `test/crm.test.js` **first**, with explicit
   assertions on scores, `riskLabel` boundaries, and `forecastCategory` outcomes.
3. Apply the weight change in `scoreDealRisk`. Keep the math deterministic —
   no randomness, no opaque heuristics.
4. Run `npm test` and confirm all green.
5. Summarize **why** deals now score differently — a sales manager must be able
   to understand every flag.

## Constraints

- `daysUntil()` uses the fixed reference date `2026-05-28`; never change it as a
  side effect of a scoring change.
- Risk labels exist to surface deals needing attention, not to punish every
  imperfect deal — check label distribution against the fixture before and after.
