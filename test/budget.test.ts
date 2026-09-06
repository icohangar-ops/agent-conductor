import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BoundedRunController,
  inspectContext,
  runSafeAutonomousRecipe,
} from "../src/budget/index.ts";
import type { ChpGate } from "../src/budget/types.ts";
import { compileContract, loadContract } from "../src/contract/parser.ts";

const EXAMPLE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "examples",
  "safe-autonomous-run",
  "AGENTS.md",
);

function passingGate(): ChpGate {
  return {
    async r0Gate(input) {
      const results = {
        Solvable: input.solvable ? "PASS" : "FATAL",
        Scoped: input.scoped ? "PASS" : "FATAL",
        Valid: input.valid ? "PASS" : "FATAL",
        Worth_it: input.worth_it ? "PASS" : "FATAL",
        ...(input.funded === undefined ? {} : { Funded: input.funded ? "PASS" : "FATAL" }),
      } as Record<string, "PASS" | "FATAL">;
      return {
        verdict: Object.values(results).every((v) => v === "PASS") ? "PASS" : "HALT",
        results,
      };
    },
  };
}

test("preflight breaks tokens down by context class and marks approximate", () => {
  const estimate = inspectContext(
    {
      systemRules: "a".repeat(40),
      history: "b".repeat(80),
      toolSchemas: "c".repeat(20),
      userPrompt: "d".repeat(8),
      expectedOutputTokens: 10,
    },
    "small",
  );
  assert.equal(estimate.tokens.systemRules, 10);
  assert.equal(estimate.tokens.history, 20);
  assert.equal(estimate.tokens.toolSchemas, 5);
  assert.equal(estimate.tokens.userPrompt, 2);
  assert.equal(estimate.tokens.outputEstimate, 10);
  assert.equal(estimate.approximate, true);
  assert.match(estimate.tokens.method, /chars\/4/);
  assert.ok(estimate.totalUsd > 0);
});

test("missing mandate and commit without authorize fail closed", async () => {
  const controller = new BoundedRunController();
  const unauthorized = await controller.authorize({
    runId: "nope",
    kind: "model",
    name: "haiku",
  });
  assert.equal(unauthorized.verdict, "HALT");
  assert.equal(unauthorized.reason, "missing_mandate");

  const commit = controller.commit({ clearanceId: "clr_missing" });
  assert.equal(commit.verdict, "HALT");
  assert.equal(commit.reason, "no_clearance");
});

test("begin rejects a mandate with no ceilings", () => {
  const controller = new BoundedRunController();
  const begun = controller.begin({ tenantId: "t" });
  assert.equal(begun.ok, false);
  if (!begun.ok) assert.equal(begun.reason, "invalid_mandate");
});

test("run ceiling stops the next authorize and leaves a before ledger", async () => {
  const controller = new BoundedRunController();
  const begun = controller.begin({
    tenantId: "acme",
    runId: "ceil-run",
    runUsd: 0.0001,
    tenantDayUsd: 1,
    maxTurns: 8,
    preferredModelClass: "small",
    maxModelClass: "small",
  });
  assert.equal(begun.ok, true);

  const first = await controller.authorize({
    runId: "ceil-run",
    kind: "model",
    name: "haiku",
    estimatedUsd: 0.00008,
    context: { userPrompt: "hi", expectedOutputTokens: 1 },
  });
  assert.equal(first.verdict, "PASS");
  assert.ok(first.clearanceId);
  const settled = controller.commit({ clearanceId: first.clearanceId! });
  assert.equal(settled.verdict, "PASS");

  const blocked = await controller.authorize({
    runId: "ceil-run",
    kind: "model",
    name: "haiku",
    estimatedUsd: 0.00008,
    context: { userPrompt: "again", expectedOutputTokens: 1 },
  });
  assert.equal(blocked.verdict, "HALT");
  assert.equal(blocked.reason, "run_ceiling");
  assert.equal(blocked.clearanceId, undefined);

  const before = controller.getLedger().filter((e) => e.phase === "before" && e.kind === "model");
  const after = controller.getLedger().filter((e) => e.phase === "after" && e.kind === "model");
  assert.ok(before.length >= 2);
  assert.equal(after.length, 1);
});

test("kill switch blocks the next authorize without consulting a gate", async () => {
  let gateCalls = 0;
  const controller = new BoundedRunController({
    gate: {
      async r0Gate() {
        gateCalls += 1;
        return { verdict: "PASS", results: { Solvable: "PASS", Scoped: "PASS", Valid: "PASS", Worth_it: "PASS" } };
      },
    },
  });
  assert.equal(
    controller.begin({
      tenantId: "acme",
      runId: "kill-run",
      runUsd: 1,
      tenantDayUsd: 1,
    }).ok,
    true,
  );
  controller.kill("kill-run", "stop");
  const blocked = await controller.authorize({
    runId: "kill-run",
    kind: "model",
    name: "haiku",
    estimatedUsd: 0.001,
  });
  assert.equal(blocked.verdict, "HALT");
  assert.equal(blocked.reason, "kill_switch");
  assert.equal(gateCalls, 0);
});

test("high-impact tool requires approval and CHP R0", async () => {
  const controller = new BoundedRunController({ gate: passingGate() });
  assert.equal(
    controller.begin({
      tenantId: "acme",
      runId: "impact-run",
      runUsd: 1,
      tenantDayUsd: 1,
      highImpactTools: ["Bash"],
    }).ok,
    true,
  );

  const paused = await controller.authorize({
    runId: "impact-run",
    kind: "tool",
    name: "Bash",
    estimatedUsd: 0.001,
  });
  assert.equal(paused.verdict, "APPROVE_REQUIRED");
  assert.equal(paused.clearanceId, undefined);

  const denied = await controller.approve("impact-run", "Bash", {
    solvable: true,
    scoped: false,
    valid: true,
    worth_it: true,
  });
  assert.equal(denied.verdict, "HALT");
  assert.equal(denied.reason, "chp_r0");

  const allowed = await controller.approve("impact-run", "Bash", {
    solvable: true,
    scoped: true,
    valid: true,
    worth_it: true,
  });
  assert.equal(allowed.verdict, "PASS");

  const next = await controller.authorize({
    runId: "impact-run",
    kind: "tool",
    name: "Bash",
    estimatedUsd: 0.001,
  });
  assert.equal(next.verdict, "PASS");
  assert.ok(next.clearanceId);
});

test("per-tool ceiling applies to tools only, not model turns", async () => {
  const controller = new BoundedRunController();
  assert.equal(
    controller.begin({
      tenantId: "acme",
      runId: "tool-cap",
      runUsd: 1,
      tenantDayUsd: 1,
      defaultToolUsd: 0.00005,
      toolUsd: { Bash: 0.0001 },
    }).ok,
    true,
  );
  const model = await controller.authorize({
    runId: "tool-cap",
    kind: "model",
    name: "haiku",
    estimatedUsd: 0.0002,
  });
  assert.equal(model.verdict, "PASS");
  assert.equal(controller.commit({ clearanceId: model.clearanceId! }).verdict, "PASS");

  const blocked = await controller.authorize({
    runId: "tool-cap",
    kind: "tool",
    name: "Bash",
    estimatedUsd: 0.0002,
  });
  assert.equal(blocked.verdict, "HALT");
  assert.equal(blocked.reason, "tool_ceiling");
});

test("stuck-loop turn cap fail-closes further model calls", async () => {
  const controller = new BoundedRunController();
  assert.equal(
    controller.begin({
      tenantId: "acme",
      runId: "loop-run",
      runUsd: 10,
      tenantDayUsd: 10,
      maxTurns: 2,
    }).ok,
    true,
  );

  for (let i = 0; i < 2; i++) {
    const auth = await controller.authorize({
      runId: "loop-run",
      kind: "model",
      name: "haiku",
      estimatedUsd: 0.001,
    });
    assert.equal(auth.verdict, "PASS");
    assert.equal(controller.commit({ clearanceId: auth.clearanceId! }).verdict, "PASS");
  }

  const blocked = await controller.authorize({
    runId: "loop-run",
    kind: "model",
    name: "haiku",
    estimatedUsd: 0.001,
  });
  assert.equal(blocked.verdict, "HALT");
  assert.equal(blocked.reason, "stuck_loop");
  assert.ok(controller.getLedger().some((e) => e.kind === "route"));
});

test("underestimate settle trips hard stop so the next authorize cannot continue", async () => {
  const controller = new BoundedRunController();
  assert.equal(
    controller.begin({
      tenantId: "acme",
      runId: "overshoot",
      runUsd: 0.001,
      tenantDayUsd: 1,
    }).ok,
    true,
  );
  const auth = await controller.authorize({
    runId: "overshoot",
    kind: "model",
    name: "haiku",
    estimatedUsd: 0.0004,
  });
  assert.equal(auth.verdict, "PASS");
  const settled = controller.commit({ clearanceId: auth.clearanceId!, actualUsd: 0.002 });
  assert.equal(settled.verdict, "HALT");
  assert.equal(settled.reason, "hard_stop");

  const again = await controller.authorize({
    runId: "overshoot",
    kind: "model",
    name: "haiku",
    estimatedUsd: 0.0001,
  });
  assert.equal(again.verdict, "HALT");
  assert.equal(again.reason, "hard_stop");
});

test("safe autonomous run recipe hits the ceiling and stops cleanly", async () => {
  const result = await runSafeAutonomousRecipe({ runUsd: 0.0004, runId: "recipe-run" });
  assert.ok(result.steps >= 1);
  assert.ok(["run_ceiling", "tenant_day_ceiling", "stuck_loop", "hard_stop"].includes(result.stoppedAt));
  assert.equal(result.last.verdict, "HALT");
  assert.equal(result.last.clearanceId, undefined);

  const afterHalt = result.ledger.filter((e) => e.verdict === "HALT" && e.kind === "model");
  assert.ok(afterHalt.length >= 1);
  const reservedAfterHalt = result.ledger.filter(
    (e) => e.phase === "before" && e.verdict === "PASS" && e.runId === "recipe-run" && e.kind === "model",
  );
  const settled = result.ledger.filter((e) => e.phase === "after" && e.kind === "model" && e.runId === "recipe-run");
  assert.equal(reservedAfterHalt.length, settled.length);
});

test("parser extracts a spend mandate from the example AGENTS.md", () => {
  const contract = loadContract(EXAMPLE);
  assert.ok(contract.spendMandate);
  assert.equal(contract.spendMandate?.runUsd, 0.0004);
  assert.equal(contract.spendMandate?.tenantDayUsd, 1);
  assert.equal(contract.spendMandate?.maxTurns, 20);
  assert.equal(contract.spendMandate?.preferredModelClass, "small");
  assert.deepEqual(contract.spendMandate?.highImpactTools, ["Bash"]);
  assert.equal(contract.spendMandate?.toolUsd["Bash"], 0.0001);
});

test("pipeline-pulse fixture still has a null spend mandate", () => {
  const fixture = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "examples",
    "pipeline-pulse",
    "AGENTS.md",
  );
  const contract = loadContract(fixture);
  assert.equal(contract.spendMandate, null);
});

test("begin loads ceilings from a compiled contract spend mandate", () => {
  const contract = loadContract(EXAMPLE);
  const controller = new BoundedRunController();
  const begun = controller.begin({
    tenantId: "example-tenant",
    runId: "from-contract",
    fromContract: contract.spendMandate,
  });
  assert.equal(begun.ok, true);
  if (begun.ok) {
    assert.equal(begun.mandate.runUsd, 0.0004);
    assert.equal(begun.mandate.highImpactTools[0], "Bash");
  }
});

test("tenant-day ceiling is shared across runs for the same UTC day", async () => {
  const now = () => new Date("2026-09-06T12:00:00.000Z");
  const controller = new BoundedRunController({ now });
  assert.equal(
    controller.begin({
      tenantId: "shared",
      runId: "day-a",
      runUsd: 10,
      tenantDayUsd: 0.001,
    }).ok,
    true,
  );
  assert.equal(
    controller.begin({
      tenantId: "shared",
      runId: "day-b",
      runUsd: 10,
      tenantDayUsd: 0.001,
    }).ok,
    true,
  );
  const first = await controller.authorize({
    runId: "day-a",
    kind: "model",
    name: "haiku",
    estimatedUsd: 0.0008,
  });
  assert.equal(first.verdict, "PASS");
  assert.equal(controller.commit({ clearanceId: first.clearanceId! }).verdict, "PASS");

  const blocked = await controller.authorize({
    runId: "day-b",
    kind: "model",
    name: "haiku",
    estimatedUsd: 0.0008,
  });
  assert.equal(blocked.verdict, "HALT");
  assert.equal(blocked.reason, "tenant_day_ceiling");
});

test("inline spend mandate table compiles", () => {
  const contract = compileContract(
    [
      "# Demo",
      "",
      "## Spend mandate",
      "",
      "| Ceiling | Limit |",
      "|---------|-------|",
      "| run | $2.00 |",
      "| tenant-day | 10 |",
      "| high-impact | Write, Edit |",
      "",
    ].join("\n"),
  );
  assert.equal(contract.spendMandate?.runUsd, 2);
  assert.equal(contract.spendMandate?.tenantDayUsd, 10);
  assert.deepEqual(contract.spendMandate?.highImpactTools, ["Write", "Edit"]);
});
