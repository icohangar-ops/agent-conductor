# AGENTS.md — Pipeline Pulse CRM

Guidance for AI coding agents (Cursor, Claude Code, Codex, Copilot, Gemini CLI, and others) working in this repository.

**Sources:** Project conventions from [smcateer-eliza/crm-pipeline-dashboard](https://github.com/smcateer-eliza/crm-pipeline-dashboard); skill ecosystem patterns from [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills).

---

## Mission

Pipeline Pulse CRM is a lightweight, local-first pipeline review dashboard for B2B SaaS sales teams. Agents should help sales managers scan open opportunities, spot risky deals, compare owner books, and understand weighted pipeline — without breaking the deterministic, explainable scoring model.

---

## Architecture

```text
.
├── AGENTS.md                 # This file — agent operating manual
├── data/
│   ├── crm.json              # Seed fixture (source of truth for demo data)
│   └── crm.sqlite            # Generated on first backend run; delete to reseed
├── backend/
│   ├── database.py           # SQLite schema, seeding, CRM data access
│   └── main.py               # FastAPI app: /api/crm, static mounts, index
├── src/
│   ├── crm.js                # Business logic — scoring, forecasts, summaries
│   ├── main.js               # Browser UI — fetch, render, events only
│   └── styles.css            # Application styling
├── test/
│   └── crm.test.js           # Node built-in test runner for crm.js
├── index.html
├── package.json
└── pyproject.toml
```

### Layer responsibilities

| Layer | Role | Do | Don't |
|-------|------|----|-------|
| `data/crm.json` | Fixture data | Extend schema consistently across record groups | Hardcode one-off records in UI |
| `backend/` | Persistence + API | Seed SQLite, serve `/api/crm` and static assets | Put sales logic in Python |
| `src/crm.js` | Domain logic | Deterministic scoring, filtering, summaries | DOM manipulation |
| `src/main.js` | Presentation | Render cards, wire filters, format currency | Risk/forecast calculations |
| `test/crm.test.js` | Regression guard | Cover scoring, forecast, owner filters, summaries | Skip tests when logic changes |

### Runtime flow

1. `npm run dev` starts FastAPI on `http://127.0.0.1:5173`.
2. First run creates `data/crm.sqlite` from `data/crm.json`.
3. Browser loads `index.html` → `src/main.js` fetches `/api/crm` (falls back to `data/crm.json` if API unavailable).
4. All pipeline math runs client-side via `src/crm.js` so sales users can inspect and trust the rules.

### API surface

```text
GET /api/health   → { status, database }
GET /api/crm      → { accounts, opportunities, contacts, tasks, activities }
```

---

## Domain model

### Record groups (`data/crm.json`)

- **accounts** — company profile, owner, segment, health, ARR, renewal date
- **opportunities** — stage, amount, probability, close date, next step, activity age, contact coverage
- **contacts** — stakeholders and influence level
- **tasks** — open follow-ups and due dates
- **activities** — recent calls, emails, notes

### Pipeline logic (`src/crm.js`)

Core exports agents must preserve and test:

| Function | Purpose |
|----------|---------|
| `scoreDealRisk(opportunity, account)` | 0–100 risk score from stale activity, missing next step, contact coverage, close-date pressure, deal size, account health |
| `riskLabel(score)` | Maps to `Low`, `Medium`, `High`, `Critical` |
| `forecastCategory(opportunity, riskScore)` | Maps to `Commit`, `Best Case`, `Pipeline`, `At Risk` |
| `enrichOpportunities(data)` | Joins account context, weighted amount, risk, forecast; sorts by risk |
| `summarizePipeline(data, owner?)` | Open pipeline, weighted pipeline, critical deal count, overdue tasks |
| `filterByOwner(opportunities, owner)` | Owner-scoped opportunity list |
| `summarizeOwners(data)` | Distinct owners, alphabetically |
| `accountSnapshot(data, accountId)` | Account + contacts + tasks + activities |

**Fixed reference date:** `daysUntil()` uses `2026-05-28` as "today" so tests and demo data stay deterministic. Change this only deliberately with fixture + test updates.

### Product rules

- Risk labels help managers **find deals that need attention**, not punish every imperfect deal.
- Forecast categories stay explainable: `Commit`, `Best Case`, `Pipeline`, `At Risk`.
- Account health and opportunity risk are **related but separate**.
- Owner filters must affect pipeline metrics, opportunities, accounts, and tasks **consistently**.
- Any recommendation feature must expose **why** the recommendation was made.

---

## Engineering rules

### Non-negotiables

1. **Deterministic logic** — same inputs → same scores, labels, and summaries. No ML, randomness, or opaque heuristics in core CRM math.
2. **Logic in `crm.js`** — keep `main.js` thin (fetch, render, events).
3. **Tests on logic changes** — update `test/crm.test.js` whenever scoring, forecast, filtering, or summary behavior changes.
4. **Data over special cases** — prefer extending `data/crm.json` over hardcoded UI branches.
5. **Local-first default** — no external services, API keys, or network-dependent runtime unless explicitly requested.
6. **Minimal dependencies** — avoid new packages unless they materially simplify the app.

### Code change checklist

Before handing off work:

```bash
npm test
```

For UI changes:

```bash
npm run dev
# Open http://127.0.0.1:5173 — verify dashboard loads, owner filter works, metrics update
```

For backend/data changes, delete `data/crm.sqlite` and restart dev to confirm reseed behavior.

### Feature workflow

When starting a substantial feature:

1. Read existing patterns in `src/crm.js` and `test/crm.test.js`.
2. Write or extend tests first for new business rules.
3. Implement logic in `crm.js`, then wire UI in `main.js`.
4. Update fixture data in `data/crm.json` if new fields are required across record groups.
5. Keep styling changes scoped to `src/styles.css`.

### Git and commits

- Do not commit unless the user asks.
- Never commit secrets (`.env`, credentials, local SQLite if gitignored).
- Match existing commit style when committing.

---

## Agent skills ecosystem

This project integrates with the curated [awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) catalog (1400+ skills from Anthropic, Vercel, Stripe, Cloudflare, community teams, and more). Skills extend agent capabilities via on-demand `SKILL.md` files — only metadata loads until a skill is relevant.

### Skill paths (Cursor)

| Scope | Path |
|-------|------|
| Project | `.cursor/skills/{skill-name}/SKILL.md` |
| Personal | `~/.cursor/skills/{skill-name}/SKILL.md` |

Other tools use parallel paths — see [Skills Paths for Other AI Coding Assistants](https://github.com/VoltAgent/awesome-agent-skills#skills-paths-for-other-ai-coding-assistants) in the catalog README.

### When to load a skill

Read the full `SKILL.md` when the task matches its description. Prefer official, team-published skills over unvetted community copies. Review skill source before installing — skills are curated, not security-audited ([security notice](https://github.com/VoltAgent/awesome-agent-skills#-security-notice)).

### Recommended skills for this repo

Use these from [officialskills.sh](https://officialskills.sh) or linked GitHub repos when the task fits:

| Task | Skill | Why |
|------|-------|-----|
| CRM scoring / forecast changes | [obra/test-driven-development](https://github.com/obra/superpowers/blob/main/skills/test-driven-development/SKILL.md) | Tests-first changes to deterministic logic |
| Debugging failing tests or UI | [obra/systematic-debugging](https://github.com/obra/superpowers/blob/main/skills/systematic-debugging/SKILL.md) | Methodical root-cause analysis |
| Before marking work complete | [obra/verification-before-completion](https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md) | Run checks, confirm behavior |
| Dashboard UI polish | [anthropics/frontend-design](https://officialskills.sh/anthropics/skills/frontend-design) | Sales-dashboard UX without generic slop |
| UI constraints / accessibility | [ibelick/ui-skills](https://github.com/ibelick/ui-skills) | Opinionated interface quality |
| Browser verification | [anthropics/webapp-testing](https://officialskills.sh/anthropics/skills/webapp-testing) | Playwright-based local web app testing |
| FastAPI / Python backend | [mcollina/skills](https://github.com/mcollina/skills/tree/main/skills) | Node/Python docs, ESLint, Git workflows |
| Product / pipeline feature design | [Digidai/product-manager-skills](https://github.com/Digidai/product-manager-skills) | SaaS metrics and PM frameworks |
| PR / code review | [NeoLabHQ/code-review](https://github.com/NeoLabHQ/context-engineering-kit/tree/master/plugins/code-review) | Structured review before merge |
| README / docs updates | [Shpigford/readme](https://github.com/Shpigford/skills/tree/main/readme) | Project documentation |
| Authoring CRM-specific skills | [anthropics/skill-creator](https://officialskills.sh/anthropics/skills/skill-creator) | Extend agents with domain workflows |

Browse the full catalog: [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills).

### Skill quality standards (from awesome-agent-skills)

When creating or editing skills for this project:

| Area | Guideline |
|------|-----------|
| **Description** | Third person; state *what* and *when*; use matchable keywords (e.g. "deal risk scoring", not "CRM stuff") |
| **Progressive disclosure** | Metadata ~100 tokens; body under 500 lines; load large refs on demand |
| **Paths** | No machine-specific absolute paths; use `$PROJECT_ROOT` or relative paths |
| **Tools** | Declare only tools the skill needs; avoid `"tools": ["*"]` |

### Project-specific skills to consider

Add under `.cursor/skills/` when repeated CRM workflows emerge:

- **pipeline-scoring** — explain and modify `scoreDealRisk` weights with test updates
- **fixture-authoring** — extend `data/crm.json` consistently across all record groups
- **sales-demo-prep** — use `accountSnapshot` for meeting-prep views

Use [anthropics/skill-creator](https://officialskills.sh/anthropics/skills/skill-creator) or Cursor's skill authoring flow; store project skills in `.cursor/skills/`.

---

## Agent operating procedure

### Session startup

1. Read this file.
2. Skim `src/crm.js` and `test/crm.test.js` before changing business logic.
3. Check `package.json` scripts — do not assume a bundler; this is largely no-build ES modules + FastAPI static serving.
4. Load external skills only when the current task matches their description.

### During implementation

- **Minimize scope** — smallest correct diff; no drive-by refactors.
- **Match conventions** — naming, module style, and test patterns already in the repo.
- **Explainability first** — if a sales manager cannot understand why a deal is flagged, the change is wrong.
- **Owner filter consistency** — any new metric or list must respect the selected owner the same way existing views do.

### Before completion

1. `npm test` — all green.
2. If UI touched: `npm run dev` and smoke-test owner filter, metrics, opportunity cards.
3. If scoring/forecast changed: add or update test cases with explicit assertions on labels and categories.
4. Summarize what changed and **why** deals would score differently (if applicable).

---

## Common tasks

### Adjust risk scoring weights

Edit thresholds in `scoreDealRisk()` → update tests in `test/crm.test.js` → verify `riskLabel` boundaries still make product sense.

### Add a CRM field

1. Add to `data/crm.json` for all relevant records.
2. Extend SQLite schema in `backend/database.py` if persisted.
3. Use in `crm.js` if it affects logic; otherwise display in `main.js`.
4. Reseed: delete `data/crm.sqlite`, restart dev.

### Add a dashboard panel

Implement data prep in `crm.js` (pure functions) → render in `main.js` → style in `styles.css` → test logic if non-trivial.

---

## Out of scope (unless explicitly requested)

- External CRM integrations (Salesforce, HubSpot, etc.)
- Authentication, multi-tenant SaaS deployment
- Non-deterministic AI scoring or recommendations without explainability
- Heavy frontend frameworks or build pipelines
- Cloud database or hosted API dependencies

---

## References

- **Project:** [smcateer-eliza/crm-pipeline-dashboard](https://github.com/smcateer-eliza/crm-pipeline-dashboard)
- **Skill catalog:** [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills)
- **Skill registry:** [officialskills.sh](https://officialskills.sh)
- **Cursor skills docs:** [cursor.com/docs/context/skills](https://cursor.com/docs/context/skills)
