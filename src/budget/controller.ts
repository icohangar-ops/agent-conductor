/**
 * Bounded-run controller: spend mandate + CHP-composed clearance.
 *
 * Fail-closed. Every model/tool spend path is authorize (reserve +
 * before-ledger) then commit (settle + after-ledger). The kill switch
 * is checked before any reservation. High-impact tools require a stored
 * approval and, when a CHP gate is wired, a passing R0 result.
 */

import { estimateToolUsd, inspectContext, money } from "./estimator.ts";
import { KillSwitch } from "./killSwitch.ts";
import { routeModel } from "./router.ts";
import type {
  AuthorizeInput,
  BeginInput,
  ChpGate,
  Clearance,
  CommitInput,
  ContractSpendMandate,
  CostBreakdown,
  LedgerEntry,
  ModelClass,
  RemainingBudget,
  Reservation,
  SpendMandate,
} from "./types.ts";

const MODEL_CLASSES: readonly ModelClass[] = ["small", "mid", "high", "frontier"];

export class BoundedRunController {
  private readonly killSwitch: KillSwitch;
  private readonly gate: ChpGate | undefined;
  private readonly now: () => Date;
  private seq = 0;

  private readonly mandates = new Map<string, SpendMandate>();
  private readonly reservations = new Map<string, Reservation>();
  private readonly settled = new Set<string>();
  private readonly ledger: LedgerEntry[] = [];
  private readonly runSpent = new Map<string, number>();
  private readonly runReserved = new Map<string, number>();
  private readonly toolSpent = new Map<string, number>();
  private readonly toolReserved = new Map<string, number>();
  private readonly tenantDaySpent = new Map<string, number>();
  private readonly tenantDayReserved = new Map<string, number>();
  private readonly turns = new Map<string, number>();
  private readonly approvals = new Set<string>();
  private readonly hardStop = new Set<string>();

  constructor(options?: { gate?: ChpGate; kill?: KillSwitch; now?: () => Date }) {
    this.gate = options?.gate;
    this.killSwitch = options?.kill ?? new KillSwitch();
    this.now = options?.now ?? (() => new Date());
  }

  preflight(input: {
    context: Parameters<typeof inspectContext>[0];
    modelClass?: ModelClass;
    model?: string;
  }): CostBreakdown {
    const modelClass = input.modelClass ?? "small";
    const estimate = inspectContext(input.context, modelClass, input.model);
    this.appendLedger({
      tenantId: "",
      runId: "",
      kind: "preflight",
      phase: "preview",
      name: estimate.model,
      modelClass: estimate.modelClass,
      estimatedUsd: estimate.totalUsd,
      remaining: {
        runUsd: 0,
        tenantDayUsd: 0,
        toolUsd: 0,
        turns: 0,
        maxTurns: 0,
      },
    });
    return estimate;
  }

  begin(input: BeginInput): { ok: true; mandate: SpendMandate } | { ok: false; reason: string } {
    if (this.killSwitch.isTripped()) {
      return { ok: false, reason: "kill_switch" };
    }
    const mandate = compileMandate(input, () => this.nextId("run"));
    if (!mandate.ok) return mandate;
    if (this.killSwitch.isTripped(mandate.mandate.runId)) {
      return { ok: false, reason: "kill_switch" };
    }
    this.mandates.set(mandate.mandate.runId, mandate.mandate);
    return { ok: true, mandate: mandate.mandate };
  }

  async authorize(input: AuthorizeInput): Promise<Clearance> {
    const mandate = this.mandates.get(input.runId);
    if (!mandate) {
      return { verdict: "HALT", reason: "missing_mandate" };
    }
    if (this.killSwitch.isTripped(input.runId)) {
      this.recordHalt(mandate, input, "kill_switch");
      return { verdict: "HALT", reason: "kill_switch", remaining: this.remaining(mandate, input.name, input.kind) };
    }
    if (this.hardStop.has(input.runId)) {
      this.recordHalt(mandate, input, "hard_stop");
      return { verdict: "HALT", reason: "hard_stop", remaining: this.remaining(mandate, input.name, input.kind) };
    }

    const route =
      input.kind === "model"
        ? routeModel({
            preferred: mandate.preferredModelClass,
            maxClass: mandate.maxModelClass,
            requestedModel: input.model ?? input.name,
            requestedClass: input.modelClass,
          })
        : undefined;

    const estimate = this.estimateCall(input, mandate, route?.modelClass ?? input.modelClass);
    if (!Number.isFinite(estimate.totalUsd) || estimate.totalUsd < 0) {
      this.recordHalt(mandate, input, "invalid_mandate");
      return { verdict: "HALT", reason: "invalid_mandate", estimate };
    }

    const remaining = this.remaining(mandate, input.name, input.kind);
    if (input.kind === "model" && remaining.turns >= mandate.maxTurns) {
      this.recordHalt(mandate, input, "stuck_loop", estimate, route);
      return { verdict: "HALT", reason: "stuck_loop", estimate, remaining, route };
    }
    if (estimate.totalUsd > remaining.runUsd + 1e-12) {
      this.recordHalt(mandate, input, "run_ceiling", estimate, route);
      return { verdict: "HALT", reason: "run_ceiling", estimate, remaining, route };
    }
    if (input.kind === "tool" && estimate.totalUsd > remaining.toolUsd + 1e-12) {
      this.recordHalt(mandate, input, "tool_ceiling", estimate, route);
      return { verdict: "HALT", reason: "tool_ceiling", estimate, remaining, route };
    }
    if (estimate.totalUsd > remaining.tenantDayUsd + 1e-12) {
      this.recordHalt(mandate, input, "tenant_day_ceiling", estimate, route);
      return { verdict: "HALT", reason: "tenant_day_ceiling", estimate, remaining, route };
    }

    if (input.kind === "tool" && isHighImpact(mandate, input.name)) {
      const approvalKey = `${input.runId}:${input.name}`;
      const storedApproval = this.approvals.has(approvalKey);
      if (!storedApproval && input.approved !== true) {
        this.recordHalt(mandate, input, "high_impact_tool", estimate, route, "APPROVE_REQUIRED");
        return {
          verdict: "APPROVE_REQUIRED",
          reason: "high_impact_tool",
          estimate,
          remaining,
        };
      }
      // Stored approval already passed CHP in `approve`. A one-shot
      // `approved: true` still has to clear R0 now (fail closed).
      if (this.gate && !storedApproval) {
        const funded = estimate.totalUsd <= remaining.runUsd;
        const chp = await this.gate.r0Gate({
          solvable: input.solvable ?? false,
          scoped: input.scoped ?? false,
          valid: input.valid ?? false,
          worth_it: input.worth_it ?? funded,
          funded,
        });
        if (chp.verdict === "HALT") {
          this.recordHalt(mandate, input, "chp_r0", estimate, route);
          return { verdict: "HALT", reason: "chp_r0", chp, estimate, remaining };
        }
        this.approvals.add(approvalKey);
      }
    }

    const clearanceId = this.nextId("clr");
    this.reservations.set(clearanceId, {
      clearanceId,
      runId: mandate.runId,
      tenantId: mandate.tenantId,
      kind: input.kind,
      name: input.name,
      estimatedUsd: estimate.totalUsd,
      tokensIn: estimate.tokens.totalInput,
      tokensOut: estimate.tokens.outputEstimate,
      modelClass: estimate.modelClass,
    });
    this.addReserved(mandate, input.name, estimate.totalUsd, input.kind);
    if (input.kind === "model") {
      this.turns.set(input.runId, (this.turns.get(input.runId) ?? 0) + 1);
    }

    const afterReserve = this.remaining(mandate, input.name, input.kind);
    this.appendLedger({
      tenantId: mandate.tenantId,
      runId: mandate.runId,
      kind: input.kind,
      phase: "before",
      name: input.name,
      modelClass: estimate.modelClass,
      reason: route?.reason,
      tokensIn: estimate.tokens.totalInput,
      tokensOut: estimate.tokens.outputEstimate,
      estimatedUsd: estimate.totalUsd,
      remaining: afterReserve,
      clearanceId,
      verdict: "PASS",
    });
    if (route) {
      this.appendLedger({
        tenantId: mandate.tenantId,
        runId: mandate.runId,
        kind: "route",
        phase: "before",
        name: route.model,
        modelClass: route.modelClass,
        reason: route.reason,
        estimatedUsd: estimate.totalUsd,
        remaining: afterReserve,
        clearanceId,
        verdict: "PASS",
      });
    }

    return {
      verdict: "PASS",
      reason: "authorized",
      clearanceId,
      estimate,
      remaining: afterReserve,
      route,
    };
  }

  commit(input: CommitInput): Clearance {
    const reservation = this.reservations.get(input.clearanceId);
    if (!reservation) {
      return { verdict: "HALT", reason: this.settled.has(input.clearanceId) ? "already_settled" : "no_clearance" };
    }
    const mandate = this.mandates.get(reservation.runId);
    if (!mandate) {
      return { verdict: "HALT", reason: "missing_mandate" };
    }

    const actual = input.actualUsd !== undefined ? money(input.actualUsd) : reservation.estimatedUsd;
    if (!Number.isFinite(actual) || actual < 0) {
      return { verdict: "HALT", reason: "invalid_mandate" };
    }

    this.reservations.delete(input.clearanceId);
    this.settled.add(input.clearanceId);
    this.addReserved(mandate, reservation.name, -reservation.estimatedUsd, reservation.kind);
    this.addSpent(mandate, reservation.name, actual, reservation.kind);

    const remaining = this.remaining(mandate, reservation.name, reservation.kind);
    if (
      remaining.runUsd < -1e-12 ||
      remaining.tenantDayUsd < -1e-12 ||
      (reservation.kind === "tool" && remaining.toolUsd < -1e-12)
    ) {
      this.hardStop.add(mandate.runId);
    }

    this.appendLedger({
      tenantId: mandate.tenantId,
      runId: mandate.runId,
      kind: reservation.kind,
      phase: "after",
      name: reservation.name,
      modelClass: reservation.modelClass,
      tokensIn: input.tokensIn ?? reservation.tokensIn,
      tokensOut: input.tokensOut ?? reservation.tokensOut,
      estimatedUsd: reservation.estimatedUsd,
      actualUsd: actual,
      remaining,
      clearanceId: input.clearanceId,
      verdict: this.hardStop.has(mandate.runId) ? "HALT" : "PASS",
    });

    if (this.hardStop.has(mandate.runId)) {
      return {
        verdict: "HALT",
        reason: "hard_stop",
        clearanceId: input.clearanceId,
        remaining,
      };
    }
    return {
      verdict: "PASS",
      reason: "settled",
      clearanceId: input.clearanceId,
      remaining,
    };
  }

  async approve(
    runId: string,
    tool: string,
    r0?: { solvable: boolean; scoped: boolean; valid: boolean; worth_it: boolean },
  ): Promise<Clearance> {
    const mandate = this.mandates.get(runId);
    if (!mandate) return { verdict: "HALT", reason: "missing_mandate" };
    if (this.killSwitch.isTripped(runId)) return { verdict: "HALT", reason: "kill_switch" };

    if (this.gate) {
      if (!r0) return { verdict: "HALT", reason: "chp_r0" };
      const remaining = this.remaining(mandate, tool);
      const chp = await this.gate.r0Gate({ ...r0, funded: remaining.runUsd > 0 });
      if (chp.verdict === "HALT") {
        return { verdict: "HALT", reason: "chp_r0", chp, remaining };
      }
      this.approvals.add(`${runId}:${tool}`);
      this.appendLedger({
        tenantId: mandate.tenantId,
        runId,
        kind: "approve",
        phase: "before",
        name: tool,
        estimatedUsd: 0,
        remaining,
        verdict: "PASS",
        reason: "chp_r0",
      });
      return { verdict: "PASS", reason: "approved", chp, remaining };
    }

    this.approvals.add(`${runId}:${tool}`);
    const remaining = this.remaining(mandate, tool);
    this.appendLedger({
      tenantId: mandate.tenantId,
      runId,
      kind: "approve",
      phase: "before",
      name: tool,
      estimatedUsd: 0,
      remaining,
      verdict: "PASS",
    });
    return { verdict: "PASS", reason: "approved", remaining };
  }

  kill(runId?: string, reason = "operator_abort"): Clearance {
    this.killSwitch.trip(runId, reason);
    const target = runId && runId !== "*" ? this.mandates.get(runId) : undefined;
    this.appendLedger({
      tenantId: target?.tenantId ?? "",
      runId: runId && runId !== "*" ? runId : "*",
      kind: "kill",
      phase: "abort",
      name: "kill_switch",
      reason,
      estimatedUsd: 0,
      remaining: target
        ? this.remaining(target)
        : { runUsd: 0, tenantDayUsd: 0, toolUsd: 0, turns: 0, maxTurns: 0 },
      verdict: "HALT",
    });
    return { verdict: "HALT", reason: "kill_switch" };
  }

  status(runId?: string): {
    kill: { global: boolean; runs: string[] };
    runs: Array<{ mandate: SpendMandate; remaining: RemainingBudget; hardStop: boolean }>;
    ledger: LedgerEntry[];
  } {
    const runs = [...this.mandates.values()]
      .filter((m) => !runId || m.runId === runId)
      .map((mandate) => ({
        mandate,
        remaining: this.remaining(mandate),
        hardStop: this.hardStop.has(mandate.runId),
      }));
    const ledger = runId ? this.ledger.filter((e) => e.runId === runId || e.runId === "") : [...this.ledger];
    return { kill: this.killSwitch.snapshot(), runs, ledger };
  }

  getLedger(): readonly LedgerEntry[] {
    return this.ledger;
  }

  private estimateCall(
    input: AuthorizeInput,
    mandate: SpendMandate,
    modelClass?: ModelClass,
  ): CostBreakdown {
    const klass = modelClass ?? mandate.preferredModelClass;
    if (input.kind === "model") {
      const estimate = inspectContext(input.context ?? {}, klass, input.model ?? input.name);
      if (input.estimatedUsd !== undefined && Number.isFinite(input.estimatedUsd)) {
        return { ...estimate, totalUsd: money(input.estimatedUsd) };
      }
      return estimate;
    }
    const argsText = [
      input.context?.userPrompt ?? "",
      input.context?.toolSchemas ?? "",
    ].join("\n");
    const totalUsd =
      input.estimatedUsd !== undefined && Number.isFinite(input.estimatedUsd)
        ? money(input.estimatedUsd)
        : estimateToolUsd(argsText, 0);
    const tokens = inspectContext(input.context ?? {}, "small").tokens;
    return {
      tokens,
      modelClass: "small",
      model: input.name,
      inputUsd: totalUsd,
      outputUsd: 0,
      totalUsd,
      rates: { inputPerMTok: 0, outputPerMTok: 0 },
      approximate: true,
    };
  }

  private remaining(
    mandate: SpendMandate,
    toolName?: string,
    kind: "model" | "tool" = "tool",
  ): RemainingBudget {
    const runUsed = (this.runSpent.get(mandate.runId) ?? 0) + (this.runReserved.get(mandate.runId) ?? 0);
    const dayKey = this.dayKey(mandate.tenantId);
    const dayUsed = (this.tenantDaySpent.get(dayKey) ?? 0) + (this.tenantDayReserved.get(dayKey) ?? 0);
    const toolKey = toolName && kind === "tool" ? `${mandate.runId}:${toolName}` : undefined;
    const toolCap = toolName && kind === "tool" ? toolCeiling(mandate, toolName) : mandate.defaultToolUsd;
    const toolUsed = toolKey
      ? (this.toolSpent.get(toolKey) ?? 0) + (this.toolReserved.get(toolKey) ?? 0)
      : 0;
    return {
      runUsd: money(mandate.runUsd - runUsed),
      tenantDayUsd: money(mandate.tenantDayUsd - dayUsed),
      toolUsd: money(toolCap - toolUsed),
      turns: this.turns.get(mandate.runId) ?? 0,
      maxTurns: mandate.maxTurns,
    };
  }

  private addReserved(
    mandate: SpendMandate,
    toolName: string,
    delta: number,
    kind: "model" | "tool",
  ): void {
    this.runReserved.set(mandate.runId, money((this.runReserved.get(mandate.runId) ?? 0) + delta));
    const dayKey = this.dayKey(mandate.tenantId);
    this.tenantDayReserved.set(dayKey, money((this.tenantDayReserved.get(dayKey) ?? 0) + delta));
    if (kind === "tool") {
      const toolKey = `${mandate.runId}:${toolName}`;
      this.toolReserved.set(toolKey, money((this.toolReserved.get(toolKey) ?? 0) + delta));
    }
  }

  private addSpent(
    mandate: SpendMandate,
    toolName: string,
    delta: number,
    kind: "model" | "tool",
  ): void {
    this.runSpent.set(mandate.runId, money((this.runSpent.get(mandate.runId) ?? 0) + delta));
    const dayKey = this.dayKey(mandate.tenantId);
    this.tenantDaySpent.set(dayKey, money((this.tenantDaySpent.get(dayKey) ?? 0) + delta));
    if (kind === "tool") {
      const toolKey = `${mandate.runId}:${toolName}`;
      this.toolSpent.set(toolKey, money((this.toolSpent.get(toolKey) ?? 0) + delta));
    }
  }

  private dayKey(tenantId: string): string {
    return `${tenantId}:${this.now().toISOString().slice(0, 10)}`;
  }

  private recordHalt(
    mandate: SpendMandate,
    input: AuthorizeInput,
    reason: string,
    estimate?: CostBreakdown,
    route?: Clearance["route"],
    verdict: Clearance["verdict"] = "HALT",
  ): void {
    this.appendLedger({
      tenantId: mandate.tenantId,
      runId: mandate.runId,
      kind: input.kind,
      phase: "before",
      name: input.name,
      modelClass: estimate?.modelClass ?? route?.modelClass,
      reason,
      tokensIn: estimate?.tokens.totalInput,
      tokensOut: estimate?.tokens.outputEstimate,
      estimatedUsd: estimate?.totalUsd ?? 0,
      remaining: this.remaining(mandate, input.name, input.kind),
      verdict,
    });
  }

  private appendLedger(entry: Omit<LedgerEntry, "id" | "at"> & { reason?: string }): void {
    this.ledger.push({
      id: this.nextId("led"),
      at: this.now().toISOString(),
      ...entry,
    });
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }
}

export function compileMandate(
  input: BeginInput,
  newRunId: () => string,
): { ok: true; mandate: SpendMandate } | { ok: false; reason: string } {
  const contract: ContractSpendMandate | null = input.fromContract ?? null;
  const runUsd = pickNumber(input.runUsd, contract?.runUsd);
  const tenantDayUsd = pickNumber(input.tenantDayUsd, contract?.tenantDayUsd);
  const defaultToolUsd = pickNumber(input.defaultToolUsd, contract?.defaultToolUsd) ?? 0.01;
  const maxTurns = pickNumber(input.maxTurns, contract?.maxTurns) ?? 8;
  const maxModelClass = input.maxModelClass ?? contract?.maxModelClass ?? "mid";
  const preferredModelClass = input.preferredModelClass ?? contract?.preferredModelClass ?? "small";

  if (runUsd === null || tenantDayUsd === null) {
    return { ok: false, reason: "invalid_mandate" };
  }
  if (!Number.isFinite(runUsd) || runUsd < 0 || !Number.isFinite(tenantDayUsd) || tenantDayUsd < 0) {
    return { ok: false, reason: "invalid_mandate" };
  }
  if (!Number.isFinite(defaultToolUsd) || defaultToolUsd < 0) {
    return { ok: false, reason: "invalid_mandate" };
  }
  if (!Number.isFinite(maxTurns) || maxTurns < 0 || !Number.isInteger(maxTurns)) {
    return { ok: false, reason: "invalid_mandate" };
  }
  if (!MODEL_CLASSES.includes(maxModelClass) || !MODEL_CLASSES.includes(preferredModelClass)) {
    return { ok: false, reason: "invalid_mandate" };
  }

  const toolUsd = { ...(contract?.toolUsd ?? {}), ...(input.toolUsd ?? {}) };
  for (const value of Object.values(toolUsd)) {
    if (!Number.isFinite(value) || value < 0) return { ok: false, reason: "invalid_mandate" };
  }

  return {
    ok: true,
    mandate: {
      tenantId: input.tenantId,
      runId: input.runId ?? newRunId(),
      runUsd,
      tenantDayUsd,
      toolUsd,
      defaultToolUsd,
      maxTurns,
      highImpactTools: input.highImpactTools ?? contract?.highImpactTools ?? [],
      maxModelClass,
      preferredModelClass,
    },
  };
}

function pickNumber(explicit?: number, fromContract?: number | null): number | null {
  if (explicit !== undefined) return explicit;
  if (fromContract !== undefined && fromContract !== null) return fromContract;
  return null;
}

function isHighImpact(mandate: SpendMandate, name: string): boolean {
  const needle = name.toLowerCase();
  return mandate.highImpactTools.some((t) => t.toLowerCase() === needle);
}

function toolCeiling(mandate: SpendMandate, name: string): number {
  if (mandate.toolUsd[name] !== undefined) return mandate.toolUsd[name];
  const hit = Object.entries(mandate.toolUsd).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return hit ? hit[1] : mandate.defaultToolUsd;
}
