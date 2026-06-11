import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverSkills, loadSkill, parseFrontmatter } from "../src/skills/loader.ts";
import { SkillRegistry } from "../src/skills/registry.ts";

const EXAMPLE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "examples", "pipeline-pulse");

test("discovers the example project skill with metadata only", () => {
  const skills = discoverSkills(EXAMPLE_ROOT);
  const scoring = skills.find((s) => s.name === "pipeline-scoring");
  assert.ok(scoring, "pipeline-scoring should be discovered");
  assert.equal(scoring.scope, "project");
  assert.match(scoring.description, /scoreDealRisk/);
  assert.deepEqual(scoring.tools, ["Read", "Edit", "Bash"]);
  assert.ok(!("body" in scoring), "discovery must not load the body");
});

test("loadSkill returns the full body on demand", () => {
  const [metadata] = discoverSkills(EXAMPLE_ROOT).filter((s) => s.name === "pipeline-scoring");
  const skill = loadSkill(metadata);
  assert.match(skill.body, /## Steps/);
  assert.match(skill.body, /2026-05-28/);
});

test("registry refresh + load round-trip", () => {
  const registry = new SkillRegistry();
  registry.refresh(EXAMPLE_ROOT);
  assert.ok(registry.has("pipeline-scoring"));
  const loaded = registry.load("pipeline-scoring");
  assert.ok(loaded);
  assert.match(loaded.body, /deterministic/i);
  const summary = registry.getSummary();
  assert.ok(summary.every((s) => !("body" in s) && !("path" in s)));
});

test("parseFrontmatter handles scalars, inline lists, and dash lists", () => {
  const { fields, body } = parseFrontmatter(
    '---\nname: demo\ndescription: "quoted text"\ntools: [A, B]\nextra:\n  - one\n  - two\n---\nBody here.',
  );
  assert.equal(fields["name"], "demo");
  assert.equal(fields["description"], "quoted text");
  assert.deepEqual(fields["tools"], ["A", "B"]);
  assert.deepEqual(fields["extra"], ["one", "two"]);
  assert.equal(body, "Body here.");
});

test("parseFrontmatter passes through files without frontmatter", () => {
  const { fields, body } = parseFrontmatter("# Just markdown\n");
  assert.deepEqual(fields, {});
  assert.match(body, /Just markdown/);
});
