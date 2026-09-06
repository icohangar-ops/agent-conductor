# Agent Conductor

**AGENTS.md in, governed agent team out.**

Agent Conductor is an [MCP](https://modelcontextprotocol.io) server that turns
the two conventions the coding-agent ecosystem has converged on —
[`AGENTS.md`](https://agents.md) operating manuals and `SKILL.md` skills — from
passive documentation into an active orchestration layer, with a
consensus-hardened decision engine gating high-stakes changes.

- **Mirrors:** [codeberg.org/cubiczan/agent-conductor](https://codeberg.org/cubiczan/agent-conductor) · [github.com/icohangar-ops/agent-conductor](https://github.com/icohangar-ops/agent-conductor)
- **License:** MIT
- **Status:** v0.1 — working scaffold; see [Roadmap](#roadmap)

---

## The problem

Every serious agent tool — Claude Code, Cursor, Copilot, Codex, Gemini CLI —
now reads an `AGENTS.md` at the repo root and a catalog of `SKILL.md` files.
But both conventions are honor-system prose:

- Nothing **compiles** the contract. The non-negotiable rules, layer
  boundaries, and verification checklists live as markdown the agent may or
  may not internalize.
- Nothing **gates** the decision. An agent that's about to rewrite your
  scoring model proceeds with the same confidence as one renaming a variable.
- Nothing **verifies** the checklist ran. "Run `npm test` before handing off"
  is a suggestion, not a gate.

Conductor makes the conventions executable — without asking any agent tool to
change. It ships as a standard MCP server, so anything that speaks MCP gets
contract compilation, skill discovery, and decision gating for free.

## How it works

```text
MCP client (Claude Code / Cursor / Copilot / ...)
        │  stdio (JSON-RPC, MCP)
        ▼
┌────────────────────────────────────────────────┐
│ TypeScript front end (src/)                    │
│   contract/parser.ts   AGENTS.md → contract    │
│   skills/loader.ts     SKILL.md discovery      │
│   budget/              spend mandate + kill    │
│   server.ts            14 MCP tools            │
└────────────────┬───────────────────────────────┘
                 │  newline-delimited JSON, child stdio
                 ▼
┌────────────────────────────────────────────────┐
│ Python decision engine (engine/)               │
│   vendored Consensus Hardening Protocol core   │
│   R0 gates · foundation attacks · lifecycle    │
└────────────────────────────────────────────────┘
```

Four capability groups:

1. **Contract** — compile an `AGENTS.md` into structured mission,
   non-negotiable rules, layer do/don't boundaries, verification gates,
   skill recommendations, an optional spend mandate, and an out-of-scope list.
2. **Skills** — discover `SKILL.md` skills across project and personal
   scopes with progressive disclosure: metadata costs ~100 tokens, bodies
   load only on demand.
3. **Decision** — gate work through the
   [Consensus Hardening Protocol](https://codeberg.org/cubiczan/consensus-hardening-protocol):
   a cheap R0 sanity gate before work starts, and an adversarial
   foundation-attack pass before a high-stakes change locks.
4. **Bounded run** — fail-closed spend ceilings, preflight cost preview,
   pause-and-approve for high-impact tools, and an operator kill switch
   that does not ask the model.

## Quick start

Requirements: **Node 23+** (runs TypeScript natively) and **Python 3.9+**
(stdlib only — the engine needs no pip installs).

```bash
git clone https://codeberg.org/cubiczan/agent-conductor.git
cd agent-conductor
npm install
npm test            # TypeScript tests (parser, skills, budget, live engine bridge)
npm run test:engine # Python bridge protocol tests
npm run build
```

Register with Claude Code:

```bash
claude mcp add agent-conductor -- node /path/to/agent-conductor/dist/index.js
```

Or in any MCP client's JSON config:

```json
{
  "mcpServers": {
    "agent-conductor": {
      "command": "node",
      "args": ["/path/to/agent-conductor/dist/index.js"]
    }
  }
}
```

Set `CONDUCTOR_PYTHON` if your Python 3 lives somewhere other than `python3`.

Then, from any project that has an `AGENTS.md`:

> "Load this project's agent contract, list its verification gates, and run a
> decision_adversary pass on the change I'm about to make."

## Tool reference

### `contract_load`

Compile an AGENTS.md (or CLAUDE.md) into a structured contract. Accepts a
file path or a project directory; defaults to the current working directory.

```jsonc
// input
{ "path": "examples/pipeline-pulse" }

// output (abridged — real output from the bundled example)
{
  "source": "examples/pipeline-pulse/AGENTS.md",
  "title": "AGENTS.md — Pipeline Pulse CRM",
  "mission": "Pipeline Pulse CRM is a lightweight, local-first pipeline review dashboard...",
  "rules": [
    "Deterministic logic — same inputs → same scores, labels, and summaries...",
    "Logic in crm.js — keep main.js thin (fetch, render, events).",
    "... (6 total)"
  ],
  "layers": [
    { "layer": "src/crm.js", "role": "Domain logic",
      "do": "Deterministic scoring, filtering, summaries", "dont": "DOM manipulation" }
  ],
  "gates": [
    { "name": "Code change checklist", "commands": ["npm test"], "notes": "" },
    { "name": "Before completion", "commands": [], "notes": "npm test — all green...\n..." }
  ],
  "skills": [
    { "task": "CRM scoring / forecast changes", "skill": "obra/test-driven-development",
      "url": "https://github.com/obra/superpowers/...", "why": "Tests-first changes to deterministic logic" }
  ],
  "outOfScope": ["External CRM integrations (Salesforce, HubSpot, etc.)", "..."],
  "sectionCount": 28
}
```

The parser is **lossless**: sections it doesn't recognize are preserved
verbatim, so nothing in an unconventional AGENTS.md is dropped.

### `contract_verification`

Returns only the verification gates — the named checklists and shell commands
that must pass before work is handed off. Pair it with your agent's workflow:
run the commands, confirm success, then declare done.

### `skills_list`

Discover SKILL.md skills visible from a project root. Metadata only.

```jsonc
// input
{ "projectRoot": "examples/pipeline-pulse" }

// output
{
  "skills": [
    {
      "name": "pipeline-scoring",
      "description": "Explain and modify scoreDealRisk weights in src/crm.js with matching test updates...",
      "version": "0.1.0",
      "scope": "project"
    }
  ]
}
```

Search order (first hit per skill name wins):

| Priority | Path | Scope |
|----------|------|-------|
| 1 | `<project>/.conductor/skills/*/SKILL.md` | project |
| 2 | `<project>/.claude/skills/*/SKILL.md` | project |
| 3 | `<project>/.cursor/skills/*/SKILL.md` | project |
| 4 | `~/.claude/skills/*/SKILL.md` | personal |
| 5 | `~/.cursor/skills/*/SKILL.md` | personal |

### `skill_load`

Load the full SKILL.md body for one named skill — the on-demand half of
progressive disclosure. Call it only when the task matches the skill's
description.

### `decision_gate`

The Consensus Hardening Protocol **R0 gate**: the cheapest, highest-leverage
check, run *before* doing the work.

```jsonc
// input
{ "solvable": true, "scoped": false, "valid": true, "worth_it": true }

// output
{ "verdict": "HALT", "results": { "Solvable": "PASS", "Scoped": "FATAL", "Valid": "PASS", "Worth_it": "PASS" } }
```

Any `FATAL` answer halts: stop and reframe before burning tokens on a
problem that isn't scoped, isn't understood, or isn't worth solving.

Pass optional `funded: false` to add a `Funded` row — the spend-mandate
circuit breaker composes into the same R0 HALT path rather than a side
policy engine. Omitted `funded` leaves legacy four-criterion behavior
unchanged.

### `decision_adversary`

A one-shot adversarial pass for high-stakes changes: CHP attacks the claim's
foundations, scores them 0–100, and returns devil's-advocate findings plus a
session status.

```jsonc
// input
{
  "claim": "Change scoreDealRisk stale-activity weight from 20 to 30",
  "context": "Tests updated; label distribution checked against fixture"
}

// output
{
  "status": "EXPLORING",          // or HALT / REFRAME_REQUIRED
  "foundation_score": 77,
  "findings": [
    "Treat every financial number as unverified until tied to source data.",
    "Require explicit flip criteria for any provisional recommendation."
  ],
  "verification_failures": ["PENDING third-party validation"],
  "report": "## TriangulationRunner Adversary Pass\n..."
}
```

Statuses map to the CHP decision lifecycle
(`EXPLORING → PROVISIONAL_LOCK → LOCKED`, with `HALT` and
`REFRAME_REQUIRED` exits): `EXPLORING` means the claim survived the attack
and work may proceed toward a lock; `HALT`/`REFRAME_REQUIRED` mean the
foundations failed.

### `engine_status`

Health-check the Python engine subprocess. By default returns a cheap
readiness snapshot without spawning Python; pass `probe: true` for a live
ping.

### Bounded autonomous runs

Always-on agents burn quotas; token overhead is invisible; multi-agent
loops hide cost. Conductor treats spend as a **decision gate**, not a
suggestion the model can ignore.

```text
preflight → begin(mandate) → authorize → [client calls model/tool] → commit
                 │                │
                 │                ├─ HALT (ceiling / kill / turn cap)
                 │                └─ APPROVE_REQUIRED → run_approve + CHP R0
                 └─ run_kill at any time (process-local, no model)
```

**Fail closed.** A run without finite `runUsd` and `tenantDayUsd` cannot
start. `run_commit` without a clearance id from `run_authorize` is
rejected. After an underestimate settle that crosses a ceiling, the run
trips a hard stop so the next authorize cannot continue.

**Approximate preview.** Tokens ≈ `ceil(chars / 4)`. Class rates (USD per
1M tokens) follow CHP `ModelTier` names and are **not** live provider
prices:

| Class | Typical names | Input / 1M | Output / 1M |
|-------|---------------|------------|-------------|
| `small` | haiku, mini | $0.15 | $0.60 |
| `mid` | sonnet, 4o | $3 | $15 |
| `high` | opus-high, gpt-5 | $15 | $75 |
| `frontier` | opus-max | $25 | $125 |

Pass `actualUsd` / token counts on `run_commit` when the provider reports
them. The inspector always sets `approximate: true`.

**Ceilings.** Per-run, per-tool, and per-tenant UTC-day USD. `maxTurns`
is a stuck-loop hard cap on model authorizations. High-impact tools
return `APPROVE_REQUIRED` until `run_approve` (which runs CHP R0 when
the engine is wired). `run_kill` trips a process-local switch; further
`run_begin` / `run_authorize` calls HALT without consulting a model.

**Ledger.** Every authorize writes a `before` record (and a `route`
record for model calls: chosen class, why, estimate). Every commit writes
`after`. Halted attempts are also ledgered. The store is in-memory for
the MCP process.

**AGENTS.md convention.** A `Spend mandate` section (aliases: spend cap,
cost ceiling, budget ceiling) compiles into `contract.spendMandate`:

```markdown
## Spend mandate

| Ceiling | Limit |
|---------|-------|
| run | 2.00 |
| tenant-day | 10.00 |
| tool-default | 0.25 |
| tool:Bash | 0.10 |
| max-turns | 12 |
| max-model-class | mid |
| preferred-model-class | small |

### High-impact tools

- Bash
```

See [examples/safe-autonomous-run](examples/safe-autonomous-run/AGENTS.md)
for a recipe that hits a tiny ceiling and stops. The same loop is
`runSafeAutonomousRecipe()` in `src/budget/recipe.ts`.

### `run_preflight`

Dry-run context inspector. Input: `systemRules`, `history`, `toolSchemas`,
`userPrompt`, optional `modelClass` (default `small`). Output: per-class
token counts, input/output USD, `approximate: true`.

### `run_begin`

Start a run. Pass explicit ceilings and/or `path` to an AGENTS.md with a
spend mandate. Requires `tenantId`. Missing/invalid ceilings return an
error (`invalid_mandate`).

### `run_authorize` / `run_commit`

Two-phase spend. Authorize reserves the estimate and returns a
`clearanceId` on PASS. Commit settles actuals. Reasons include
`run_ceiling`, `tool_ceiling`, `tenant_day_ceiling`, `stuck_loop`,
`kill_switch`, `hard_stop`, `no_clearance`, `high_impact_tool`.

### `run_approve` / `run_kill` / `run_status`

Human checkpoint, operator abort, and ledger/remaining snapshot.

## What the parser recognizes

`contract_load` is convention-based, not schema-based. It extracts the
patterns AGENTS.md files in the wild actually use:

| Contract field | Source convention |
|----------------|-------------------|
| `mission` | First `Mission` / `Purpose` / `Overview` section |
| `rules` | List items under `Non-negotiables` > `Engineering rules` > generic `rules` (priority-ordered so a generic "Product rules" section never shadows explicit non-negotiables) |
| `layers` | First table with a `Layer` column under an architecture-like heading |
| `gates` | Shell code blocks + list items under checklist / verification / before-completion headings |
| `skills` | Tables with `Task` / `Skill` / `Why` columns; links resolved to text + URL |
| `outOfScope` | List under an out-of-scope / non-goals heading |
| `spendMandate` | Table under `Spend mandate` / spend cap / cost ceiling / budget ceiling; high-impact tool lists |
| `sections` | Everything, verbatim — the lossless fallback |

Headings inside code fences are ignored; tables tolerate emphasis in headers;
markdown links and emphasis are stripped from extracted text.

## Writing skills

A skill is a directory containing `SKILL.md` with YAML frontmatter:

```markdown
---
name: pipeline-scoring
description: Explain and modify scoreDealRisk weights in src/crm.js with matching test updates. Use when changing deal risk scoring, risk labels, or forecast thresholds.
version: 0.1.0
tools: [Read, Edit, Bash]
---

# Pipeline Scoring

Step-by-step instructions the agent follows when the task matches...
```

Quality bar (inherited from the
[awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills)
standards): third-person description with matchable keywords, metadata around
100 tokens, body under 500 lines, no machine-specific absolute paths, declare
only the tools the skill needs.

The bundled fixtures are
[examples/pipeline-pulse](examples/pipeline-pulse/AGENTS.md) (parser /
skills) and
[examples/safe-autonomous-run](examples/safe-autonomous-run/AGENTS.md)
(spend ceilings that halt a looping recipe).

## Project structure

```text
.
├── AGENTS.md                  # This repo's own contract (compiles with itself)
├── ARCHITECTURE.md            # Design decisions and component detail
├── src/
│   ├── index.ts               # stdio entrypoint
│   ├── server.ts              # MCP server: 14 tools
│   ├── contract/              # AGENTS.md → AgentContract compiler
│   ├── skills/                # SKILL.md loader + registry
│   ├── budget/                # spend mandate, preflight, kill switch, ledger
│   ├── engine/chpBridge.ts    # Python engine client
│   └── utils/logger.ts        # stderr-only logging (stdout is the transport)
├── engine/
│   ├── bridge.py              # JSON-over-stdio request router
│   ├── test_bridge.py         # protocol tests
│   └── vendor/cme/            # vendored CHP core (MIT, byte-identical; see NOTICE.md)
├── examples/pipeline-pulse/   # real AGENTS.md fixture + example skill
├── examples/safe-autonomous-run/  # bounded-run recipe (ceiling + halt)
├── openspec/                  # living change docs for this capability
└── test/                      # node:test suites (run the .ts directly)
```

## Development

```bash
npm test            # TypeScript tests — includes a live engine round-trip
npm run test:engine # Python-side protocol tests
npx tsc --noEmit    # type check
npm run build       # emit dist/
npm run dev         # run the server from source (Node type stripping)
```

House rules (the full set is in this repo's own [AGENTS.md](AGENTS.md)):

1. **stdout is sacred** — the MCP transport owns it; all logging goes to
   stderr on both sides of the bridge.
2. **Zero new runtime dependencies** — only `@modelcontextprotocol/sdk` and
   `zod`; markdown and frontmatter parsing stay hand-rolled and tested.
3. **Erasable TypeScript only** — source must run under Node's type
   stripping (no enums, no parameter properties).
4. **Vendor discipline** — `engine/vendor/cme/` stays byte-identical to
   upstream except the documented `__init__.py` patch; engine behavior
   changes belong in `bridge.py`.

## Roadmap

| Version | Theme | Scope |
|---------|-------|-------|
| **v0.2** | Enforcement | Execute `contract_verification` gates as real subprocesses and return pass/fail evidence — turning "reads the contract" into "enforces the contract" |
| **v0.3** | Orchestration | Map contract layers onto CHP `MeshAgent` capabilities (`produces`/`consumes`) and expose full multi-agent deliberation sessions over MCP |
| **v0.4** | Registry | Install vetted skills from remote catalogs (awesome-agent-skills format) with source-review prompts |

## Provenance

Conductor deliberately reuses proven components rather than rewriting them:

| Component | Source | License |
|-----------|--------|---------|
| Decision engine (`engine/vendor/cme/`) | [consensus-hardening-protocol](https://codeberg.org/cubiczan/consensus-hardening-protocol) | MIT |
| MCP server + registry shape | [onchainmind](https://codeberg.org/cubiczan/onchainmind) | MIT |
| Skill quality standards | [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | — |
| Example fixture | Pipeline Pulse CRM operating manual | fixture |

See [engine/vendor/NOTICE.md](engine/vendor/NOTICE.md) for vendoring details
and [ARCHITECTURE.md](ARCHITECTURE.md) for the reasoning behind the
two-language design.

## License

MIT — see [LICENSE](LICENSE). Vendored components retain their original MIT
licenses.
