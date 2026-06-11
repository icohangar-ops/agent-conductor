import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileContract, loadContract, parseCodeFences, parseTable } from "../src/contract/parser.ts";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "..", "examples", "pipeline-pulse", "AGENTS.md");

test("compiles the Pipeline Pulse AGENTS.md fixture", () => {
  const contract = loadContract(FIXTURE);

  assert.equal(contract.title, "AGENTS.md — Pipeline Pulse CRM");
  assert.match(contract.mission, /pipeline review dashboard/i);

  // Six non-negotiables, emphasis stripped.
  assert.equal(contract.rules.length, 6);
  assert.match(contract.rules[0], /^Deterministic logic/);

  // Layer responsibility table.
  assert.equal(contract.layers.length, 5);
  const crm = contract.layers.find((l) => l.layer === "src/crm.js");
  assert.ok(crm);
  assert.equal(crm.role, "Domain logic");
  assert.match(crm.dont, /DOM manipulation/);

  // Verification gates carry runnable commands.
  const gateCommands = contract.gates.flatMap((g) => g.commands);
  assert.ok(gateCommands.includes("npm test"));
  assert.ok(gateCommands.includes("npm run dev"));

  // Skill recommendations resolve links.
  assert.ok(contract.skills.length >= 10);
  const tdd = contract.skills.find((s) => s.skill.includes("test-driven-development"));
  assert.ok(tdd);
  assert.match(tdd.url, /^https:\/\/github\.com\//);

  // Out-of-scope list.
  assert.ok(contract.outOfScope.some((item) => /Salesforce/.test(item)));
});

test("survives a minimal contract with no recognized sections", () => {
  const contract = compileContract("# Tiny Project\n\nJust a readme-style note.\n", "tiny.md");
  assert.equal(contract.title, "Tiny Project");
  assert.deepEqual(contract.rules, []);
  assert.deepEqual(contract.gates, []);
  assert.deepEqual(contract.skills, []);
  assert.ok(contract.sections.length > 0);
});

test("parseTable handles separator rows and emphasis in headers", () => {
  const rows = parseTable(
    "| Layer | **Role** |\n|-------|------|\n| `a.js` | logic |\n| `b.js` | view |",
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0]["role"], "logic");
});

test("parseCodeFences keeps language tags and ignores prose", () => {
  const fences = parseCodeFences("text\n```bash\nnpm test\n```\nmore\n```js\nx()\n```\n");
  assert.equal(fences.length, 2);
  assert.equal(fences[0].lang, "bash");
  assert.equal(fences[0].code, "npm test");
});

test("headings inside code fences do not split sections", () => {
  const contract = compileContract("# Top\n\n```md\n# not a heading\n```\n\n## Real\nbody\n");
  assert.ok(contract.sections.every((s) => s.heading !== "not a heading"));
});
