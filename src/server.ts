/**
 * Agent Conductor — MCP server.
 *
 * Exposes three capability groups to any MCP client (Claude Code, Cursor,
 * Copilot, ...):
 *
 *   contract_*  — compile an AGENTS.md operating manual into actionable
 *                 rules, layer boundaries, verification gates, and an
 *                 optional spend mandate
 *   skills_*    — discover and progressively load SKILL.md skills
 *   decision_*  — gate high-stakes changes through the vendored
 *                 Consensus Hardening Protocol engine
 *   run_*       — bounded autonomous runs: preflight, spend ceilings,
 *                 pause-and-approve, kill switch, routing ledger
 *
 * Server shape adapted from onchainmind's MCPServer
 * (https://codeberg.org/cubiczan/onchainmind, MIT).
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BoundedRunController } from "./budget/controller.ts";
import type { ContextParts, ModelClass } from "./budget/types.ts";
import { loadContract } from "./contract/parser.ts";
import { chpBridge } from "./engine/chpBridge.ts";
import { skillRegistry } from "./skills/registry.ts";
import { logger } from "./utils/logger.ts";

const runController = new BoundedRunController({ gate: chpBridge });

const MODEL_CLASS = z.enum(["small", "mid", "high", "frontier"]);
const CONTEXT_PARTS = {
  systemRules: z.string().optional().describe("Compiled rules / system prompt"),
  history: z.string().optional().describe("Conversation or prior-turn text"),
  toolSchemas: z.string().optional().describe("Tool / skill schema text"),
  userPrompt: z.string().optional().describe("The user prompt for this turn"),
  expectedOutputTokens: z.number().optional().describe("Output-token guess (default 256)"),
};

const CONTRACT_FILENAMES = ["AGENTS.md", "CLAUDE.md", ".agents.md"];

function resolveContractPath(pathOrRoot?: string): string {
  const base = resolve(pathOrRoot ?? process.cwd());
  if (base.toLowerCase().endsWith(".md")) return base;
  for (const filename of CONTRACT_FILENAMES) {
    const candidate = join(base, filename);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `No agent contract found under ${base} (looked for ${CONTRACT_FILENAMES.join(", ")})`,
  );
}

function jsonContent(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function errorContent(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true };
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "agent-conductor",
    version: "0.1.0",
    description:
      "Agent Conductor — compiles AGENTS.md contracts and SKILL.md skills into " +
      "governed, consensus-gated agent operations.",
  });

  // ─── Contract tools ────────────────────────────────────────────────────

  server.tool(
    "contract_load",
    "Compile an AGENTS.md operating manual into a structured agent contract: " +
      "mission, non-negotiable rules, layer responsibilities, verification gates, " +
      "recommended skills, and out-of-scope list. Pass a file path or a project " +
      "directory (defaults to the current working directory).",
    { path: z.string().optional().describe("AGENTS.md path or project root") },
    async ({ path }) => {
      try {
        const contract = loadContract(resolveContractPath(path));
        const { sections, ...summary } = contract;
        return jsonContent({ ...summary, sectionCount: sections.length });
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "contract_verification",
    "Return the verification gates from a project's agent contract — the named " +
      "checklists and shell commands that must pass before work is handed off. " +
      "Run these and confirm success before declaring any task complete.",
    { path: z.string().optional().describe("AGENTS.md path or project root") },
    async ({ path }) => {
      try {
        const contract = loadContract(resolveContractPath(path));
        return jsonContent({ source: contract.source, gates: contract.gates });
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  // ─── Skill tools ───────────────────────────────────────────────────────

  server.tool(
    "skills_list",
    "Discover SKILL.md skills visible from a project root (project-scope " +
      ".conductor/.claude/.cursor skill dirs, then personal ones). Returns " +
      "metadata only (~100 tokens per skill); use skill_load for the full body.",
    { projectRoot: z.string().optional().describe("Project root (defaults to cwd)") },
    async ({ projectRoot }) => {
      try {
        skillRegistry.refresh(resolve(projectRoot ?? process.cwd()));
        return jsonContent({ skills: skillRegistry.getSummary() });
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "skill_load",
    "Load the full SKILL.md body for a named skill — the on-demand half of " +
      "progressive disclosure. Call only when the current task matches the " +
      "skill's description.",
    {
      name: z.string().describe("Skill name as returned by skills_list"),
      projectRoot: z.string().optional().describe("Project root (defaults to cwd)"),
    },
    async ({ name, projectRoot }) => {
      try {
        if (!skillRegistry.has(name)) {
          skillRegistry.refresh(resolve(projectRoot ?? process.cwd()));
        }
        const skill = skillRegistry.load(name);
        if (!skill) {
          return errorContent(
            new Error(`Skill "${name}" not found. Available: ${skillRegistry.listNames().join(", ") || "none"}`),
          );
        }
        return jsonContent(skill);
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  // ─── Decision tools (CHP engine) ───────────────────────────────────────

  server.tool(
    "decision_gate",
    "Run the Consensus Hardening Protocol R0 gate on a proposed decision: is it " +
      "solvable, scoped, valid, and worth making at all? Any FATAL answer returns " +
      "HALT — stop and reframe before doing the work.",
    {
      solvable: z.boolean().describe("Can this problem actually be solved?"),
      scoped: z.boolean().describe("Is the scope explicitly bounded?"),
      valid: z.boolean().describe("Is the current state accurately understood?"),
      worth_it: z.boolean().describe("Do the stakes justify the work?"),
      funded: z
        .boolean()
        .optional()
        .describe("Optional spend-mandate criterion. If false, R0 HALTs (Funded=FATAL)."),
    },
    async (input) => {
      try {
        return jsonContent(await chpBridge.r0Gate(input));
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "decision_adversary",
    "Run a one-shot Consensus Hardening Protocol adversarial pass against a claim " +
      "or proposed change: CHP attacks its foundations, scores them 0-100, and " +
      "returns findings plus a session status (EXPLORING / HALT / " +
      "REFRAME_REQUIRED). Use before locking any high-stakes decision.",
    {
      claim: z.string().describe("The claim or decision to attack"),
      context: z.string().optional().describe("Supporting context for the claim"),
      high_stakes: z.boolean().optional().describe("Default true"),
    },
    async ({ claim, context, high_stakes }) => {
      try {
        return jsonContent(await chpBridge.adversary({ claim, context, high_stakes }));
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "engine_status",
    "Health/readiness probe for the vendored CHP decision engine (Python " +
      "subprocess). By default returns a cheap readiness snapshot (running, last " +
      "exit code, restart-backoff state) WITHOUT spawning Python. Pass probe=true " +
      "to also issue a live ping that warms/spawns the subprocess.",
    { probe: z.boolean().optional().describe("Issue a live ping (spawns the subprocess). Default false.") },
    async ({ probe }) => {
      try {
        const readiness = chpBridge.engineStatus();
        if (!probe) return jsonContent(readiness);
        const ping = await chpBridge.ping();
        return jsonContent({ ...readiness, running: chpBridge.engineStatus().running, ping });
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  // ─── Bounded-run tools (spend mandate + kill switch) ───────────────────

  server.tool(
    "run_preflight",
    "Dry-run context inspector: approximate token and USD breakdown by " +
      "system rules, history, tool schemas, and user prompt. Uses ceil(chars/4) " +
      "and documented class rates — not a provider tokenizer.",
    {
      ...CONTEXT_PARTS,
      modelClass: MODEL_CLASS.optional().describe("CHP model class (default small)"),
      model: z.string().optional().describe("Optional model name for the ledger"),
    },
    async ({ modelClass, model, ...context }) => {
      try {
        return jsonContent(
          runController.preflight({
            context: context as ContextParts,
            modelClass: (modelClass ?? "small") as ModelClass,
            model,
          }),
        );
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "run_begin",
    "Start a bounded autonomous run with a fail-closed spend mandate. " +
      "Ceilings may be passed explicitly or loaded from an AGENTS.md Spend mandate " +
      "section. Missing/invalid ceilings HALT — nothing is authorized by default.",
    {
      tenantId: z.string().describe("Tenant key for the per-day ceiling"),
      runId: z.string().optional().describe("Run id (generated if omitted)"),
      path: z.string().optional().describe("AGENTS.md path or project root to load spend mandate"),
      runUsd: z.number().optional().describe("Per-run USD ceiling"),
      tenantDayUsd: z.number().optional().describe("Per-tenant UTC-day USD ceiling"),
      defaultToolUsd: z.number().optional().describe("Default per-tool USD ceiling"),
      maxTurns: z.number().int().optional().describe("Stuck-loop hard cap (model authorizes)"),
      highImpactTools: z.array(z.string()).optional().describe("Tools that require pause-and-approve + CHP"),
      maxModelClass: MODEL_CLASS.optional(),
      preferredModelClass: MODEL_CLASS.optional(),
      toolUsd: z.record(z.number()).optional().describe("Per-tool USD ceilings, keyed by tool name"),
    },
    async (input) => {
      try {
        const fromContract = input.path
          ? loadContract(resolveContractPath(input.path)).spendMandate
          : null;
        const result = runController.begin({
          tenantId: input.tenantId,
          runId: input.runId,
          runUsd: input.runUsd,
          tenantDayUsd: input.tenantDayUsd,
          defaultToolUsd: input.defaultToolUsd,
          maxTurns: input.maxTurns,
          highImpactTools: input.highImpactTools,
          maxModelClass: input.maxModelClass,
          preferredModelClass: input.preferredModelClass,
          toolUsd: input.toolUsd,
          fromContract,
        });
        if (!result.ok) return errorContent(new Error(result.reason));
        return jsonContent(result);
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "run_authorize",
    "Reserve estimated spend and emit a before-ledger record. Fail-closes on " +
      "kill switch, missing mandate, run/tool/tenant-day ceiling, or stuck-loop " +
      "turn cap. High-impact tools return APPROVE_REQUIRED until run_approve.",
    {
      runId: z.string(),
      kind: z.enum(["model", "tool"]),
      name: z.string().describe("Model or tool name"),
      estimatedUsd: z.number().optional().describe("Override the approximate estimate"),
      modelClass: MODEL_CLASS.optional(),
      model: z.string().optional(),
      approved: z.boolean().optional().describe("Caller asserts human approval for a high-impact tool"),
      solvable: z.boolean().optional().describe("CHP R0 flag (high-impact tools; default false)"),
      scoped: z.boolean().optional(),
      valid: z.boolean().optional(),
      worth_it: z.boolean().optional(),
      ...CONTEXT_PARTS,
    },
    async (input) => {
      try {
        const { runId, kind, name, estimatedUsd, modelClass, model, approved, solvable, scoped, valid, worth_it, ...context } =
          input;
        return jsonContent(
          await runController.authorize({
            runId,
            kind,
            name,
            estimatedUsd,
            modelClass,
            model,
            approved,
            solvable,
            scoped,
            valid,
            worth_it,
            context,
          }),
        );
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "run_commit",
    "Settle a prior run_authorize clearance and emit an after-ledger record. " +
      "Rejects unknown or already-settled clearance ids (no silent spend).",
    {
      clearanceId: z.string(),
      actualUsd: z.number().optional().describe("Provider-reported USD; defaults to the reserved estimate"),
      tokensIn: z.number().optional(),
      tokensOut: z.number().optional(),
    },
    async (input) => {
      try {
        return jsonContent(runController.commit(input));
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "run_approve",
    "Pause-and-approve checkpoint for a high-impact tool. When the CHP engine " +
      "is available this also runs R0 (solvable/scoped/valid/worth_it); FATAL HALTs.",
    {
      runId: z.string(),
      tool: z.string().describe("High-impact tool name to clear"),
      solvable: z.boolean().optional(),
      scoped: z.boolean().optional(),
      valid: z.boolean().optional(),
      worth_it: z.boolean().optional(),
    },
    async ({ runId, tool, solvable, scoped, valid, worth_it }) => {
      try {
        const r0 =
          solvable !== undefined || scoped !== undefined || valid !== undefined || worth_it !== undefined
            ? {
                solvable: solvable ?? false,
                scoped: scoped ?? false,
                valid: valid ?? false,
                worth_it: worth_it ?? false,
              }
            : undefined;
        return jsonContent(await runController.approve(runId, tool, r0));
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "run_kill",
    "Independent abort. Trips a process-local kill switch so further " +
      "run_begin / run_authorize calls fail closed. Does not ask the model.",
    {
      runId: z.string().optional().describe("Run to abort; omit or '*' for every run"),
      reason: z.string().optional(),
    },
    async ({ runId, reason }) => {
      try {
        return jsonContent(runController.kill(runId, reason));
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "run_status",
    "Return remaining ceilings, kill-switch state, and the spend / routing ledger.",
    { runId: z.string().optional() },
    async ({ runId }) => {
      try {
        return jsonContent(runController.status(runId));
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  logger.info("server configured: 14 tools (contract, skills, decision, run)");
  return server;
}
