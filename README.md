# Agent Conductor

**AGENTS.md in, governed agent team out.**

Agent Conductor is an MCP server that turns the passive conventions of the
agent ecosystem — `AGENTS.md` operating manuals and `SKILL.md` skills — into
an active orchestration layer, with a consensus-hardened decision engine
gating high-stakes changes.

Today, every coding agent *reads* AGENTS.md as documentation. Conductor
*executes* it: the mission, non-negotiable rules, layer boundaries,
verification checklists, and skill recommendations become structured,
queryable contracts that any MCP client (Claude Code, Cursor, Copilot,
Gemini CLI, ...) can enforce.

## What it does

| Tool | Purpose |
|------|---------|
| `contract_load` | Compile an AGENTS.md into a structured contract: mission, rules, layer do/don't boundaries, verification gates, recommended skills, out-of-scope list |
| `contract_verification` | Return the shell-command gates that must pass before work is handed off |
| `skills_list` | Discover SKILL.md skills across project and personal scopes — metadata only (~100 tokens each) |
| `skill_load` | Load a skill's full body on demand (progressive disclosure) |
| `decision_gate` | Consensus Hardening Protocol R0 gate: solvable / scoped / valid / worth it — any FATAL halts |
| `decision_adversary` | One-shot CHP adversarial pass: attacks a claim's foundations, scores 0–100, returns findings and session status |
| `engine_status` | Health-check the vendored CHP engine |

## Quick start

Requires Node 23+ (native TypeScript) and Python 3.9+ (no Python packages needed).

```bash
npm install
npm test            # 14 TypeScript tests
npm run test:engine # CHP bridge protocol tests
npm run build
```

Register with Claude Code:

```bash
claude mcp add agent-conductor -- node /path/to/agent-conductor/dist/index.js
```

Then, from any project with an AGENTS.md:

> "Load this project's agent contract, list its verification gates, and run a
> decision_adversary pass on the change I'm about to make."

## Example

[examples/pipeline-pulse](examples/pipeline-pulse/AGENTS.md) contains a real
AGENTS.md (a CRM dashboard project) plus a project-scoped
[SKILL.md](examples/pipeline-pulse/.conductor/skills/pipeline-scoring/SKILL.md).
Compiling it yields 6 non-negotiable rules, a 5-layer responsibility map,
2 verification gates (`npm test`, dev-server smoke test), and 11 skill
recommendations.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md). In one paragraph: a zero-dependency
TypeScript front end (contract parser, skill loader/registry, MCP server)
talks over newline-delimited JSON to a vendored Python decision engine — the
core of [consensus-hardening-protocol](https://codeberg.org/cubiczan/consensus-hardening-protocol)
(MIT) — which provides R0 gates, foundation attacks, and the
EXPLORING → PROVISIONAL_LOCK → LOCKED decision lifecycle. The MCP server
shape is adapted from [onchainmind](https://codeberg.org/cubiczan/onchainmind) (MIT).

## Roadmap

- **v0.2 — enforcement**: run `contract_verification` gates as actual
  subprocesses and return pass/fail evidence
- **v0.3 — orchestration**: map contract layers to CHP `MeshAgent`
  capabilities (`produces`/`consumes`) and expose full multi-agent
  deliberation sessions over MCP
- **v0.4 — registry**: pull vetted skills from a catalog
  (awesome-agent-skills format) with source review prompts

## License

MIT. Vendored components retain their original MIT licenses — see
[engine/vendor/NOTICE.md](engine/vendor/NOTICE.md).
