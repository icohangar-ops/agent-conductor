/**
 * Example driver for a "safe autonomous run": loop model + tool steps
 * until the spend ceiling or turn cap fail-closes. Used by tests and
 * documented in examples/safe-autonomous-run/.
 */

import { BoundedRunController } from "./controller.ts";
import type { Clearance, LedgerEntry } from "./types.ts";

export interface RecipeResult {
  readonly stoppedAt: string;
  readonly steps: number;
  readonly last: Clearance;
  readonly ledger: readonly LedgerEntry[];
}

export interface RecipeOptions {
  readonly controller?: BoundedRunController;
  readonly runUsd?: number;
  readonly tenantDayUsd?: number;
  readonly maxTurns?: number;
  readonly tenantId?: string;
  readonly runId?: string;
}

/**
 * Simulate a bounded loop that keeps authorizing cheap model calls
 * until the controller HALTs. No silent overspend: the loop exits on
 * the first non-PASS authorize and never commits after a HALT.
 */
export async function runSafeAutonomousRecipe(options: RecipeOptions = {}): Promise<RecipeResult> {
  const controller = options.controller ?? new BoundedRunController();
  const begun = controller.begin({
    tenantId: options.tenantId ?? "example-tenant",
    runId: options.runId ?? "safe-autonomous-run",
    runUsd: options.runUsd ?? 0.0004,
    tenantDayUsd: options.tenantDayUsd ?? 1,
    maxTurns: options.maxTurns ?? 20,
    preferredModelClass: "small",
    maxModelClass: "small",
    highImpactTools: ["Bash"],
    defaultToolUsd: 0.00005,
  });
  if (!begun.ok) {
    return {
      stoppedAt: begun.reason,
      steps: 0,
      last: { verdict: "HALT", reason: begun.reason },
      ledger: controller.getLedger(),
    };
  }

  controller.preflight({
    context: {
      systemRules: "Fail closed at the spend ceiling. Do not continue after HALT.",
      history: "turn 0",
      toolSchemas: '{"name":"echo"}',
      userPrompt: "Draft a one-line status update.",
    },
    modelClass: "small",
  });

  let steps = 0;
  let last: Clearance = { verdict: "HALT", reason: "not_started" };

  for (;;) {
    const auth = await controller.authorize({
      runId: begun.mandate.runId,
      kind: "model",
      name: "haiku",
      context: {
        systemRules: "Stay inside the spend mandate.",
        history: `prior steps: ${steps}`,
        toolSchemas: '{"name":"echo"}',
        userPrompt: `Step ${steps + 1}: emit a status token.`,
        expectedOutputTokens: 128,
      },
    });
    last = auth;
    if (auth.verdict !== "PASS" || !auth.clearanceId) {
      return { stoppedAt: auth.reason, steps, last, ledger: controller.getLedger() };
    }
    const settled = controller.commit({ clearanceId: auth.clearanceId });
    last = settled;
    if (settled.verdict !== "PASS") {
      return { stoppedAt: settled.reason, steps, last, ledger: controller.getLedger() };
    }
    steps += 1;
  }
}
