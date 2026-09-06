/**
 * Agent Conductor — spend-mandate and clearance types.
 *
 * These are in-repo types (not a published package). Model-class names
 * match CHP `ModelTier` (`engine/vendor/cme/chp/models.py`) so routing
 * and gates share a vocabulary. Clearance verdicts reuse CHP's
 * PASS / HALT plus APPROVE_REQUIRED (CHP `REQUIRES_HUMAN_VERIFICATION`).
 */

/** CHP ModelTier names, as a string union (erasable TypeScript — no enums). */
export type ModelClass = "small" | "mid" | "high" | "frontier";

export type LedgerKind = "model" | "tool" | "route" | "preflight" | "kill" | "approve";

export type LedgerPhase = "before" | "after" | "preview" | "abort";

export type ClearanceVerdict = "PASS" | "HALT" | "APPROVE_REQUIRED";

export type HaltReason =
  | "kill_switch"
  | "missing_mandate"
  | "invalid_mandate"
  | "run_ceiling"
  | "tool_ceiling"
  | "tenant_day_ceiling"
  | "stuck_loop"
  | "high_impact_tool"
  | "chp_r0"
  | "no_clearance"
  | "already_settled"
  | "hard_stop"
  | "class_cap";

/** Compiled / explicit ceilings for one bounded run. */
export interface SpendMandate {
  readonly tenantId: string;
  readonly runId: string;
  readonly runUsd: number;
  readonly tenantDayUsd: number;
  readonly toolUsd: Readonly<Record<string, number>>;
  readonly defaultToolUsd: number;
  readonly maxTurns: number;
  readonly highImpactTools: readonly string[];
  readonly maxModelClass: ModelClass;
  readonly preferredModelClass: ModelClass;
}

/** Optional spend block extracted from AGENTS.md. */
export interface ContractSpendMandate {
  readonly runUsd: number | null;
  readonly tenantDayUsd: number | null;
  readonly toolUsd: Readonly<Record<string, number>>;
  readonly defaultToolUsd: number | null;
  readonly maxTurns: number | null;
  readonly highImpactTools: readonly string[];
  readonly maxModelClass: ModelClass | null;
  readonly preferredModelClass: ModelClass | null;
}

export interface ContextParts {
  readonly systemRules?: string;
  readonly history?: string;
  readonly toolSchemas?: string;
  readonly userPrompt?: string;
  readonly expectedOutputTokens?: number;
}

export interface TokenBreakdown {
  readonly systemRules: number;
  readonly history: number;
  readonly toolSchemas: number;
  readonly userPrompt: number;
  readonly outputEstimate: number;
  readonly totalInput: number;
  readonly total: number;
  /** Documented heuristic, e.g. "ceil(chars/4)". */
  readonly method: string;
}

export interface RateCard {
  readonly inputPerMTok: number;
  readonly outputPerMTok: number;
}

export interface CostBreakdown {
  readonly tokens: TokenBreakdown;
  readonly modelClass: ModelClass;
  readonly model: string;
  readonly inputUsd: number;
  readonly outputUsd: number;
  readonly totalUsd: number;
  readonly rates: RateCard;
  readonly approximate: true;
}

export interface RemainingBudget {
  readonly runUsd: number;
  readonly tenantDayUsd: number;
  readonly toolUsd: number;
  readonly turns: number;
  readonly maxTurns: number;
}

export interface LedgerEntry {
  readonly id: string;
  readonly at: string;
  readonly tenantId: string;
  readonly runId: string;
  readonly kind: LedgerKind;
  readonly phase: LedgerPhase;
  readonly name: string;
  readonly modelClass?: ModelClass;
  readonly reason?: string;
  readonly tokensIn?: number;
  readonly tokensOut?: number;
  readonly estimatedUsd: number;
  readonly actualUsd?: number;
  readonly remaining: RemainingBudget;
  readonly clearanceId?: string;
  readonly verdict?: ClearanceVerdict;
}

export interface Reservation {
  readonly clearanceId: string;
  readonly runId: string;
  readonly tenantId: string;
  readonly kind: "model" | "tool";
  readonly name: string;
  readonly estimatedUsd: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly modelClass?: ModelClass;
}

export interface RouteDecision {
  readonly model: string;
  readonly modelClass: ModelClass;
  readonly reason: string;
  readonly requestedClass?: ModelClass;
  readonly capped: boolean;
}

export interface ChpGateResult {
  readonly verdict: "PASS" | "HALT";
  readonly results: Record<string, "PASS" | "FATAL">;
}

export interface ChpGate {
  r0Gate(input: {
    solvable: boolean;
    scoped: boolean;
    valid: boolean;
    worth_it: boolean;
    funded?: boolean;
  }): Promise<ChpGateResult>;
}

export interface Clearance {
  readonly verdict: ClearanceVerdict;
  readonly reason: string;
  readonly clearanceId?: string;
  readonly chp?: ChpGateResult;
  readonly estimate?: CostBreakdown;
  readonly remaining?: RemainingBudget;
  readonly route?: RouteDecision;
}

export interface BeginInput {
  readonly tenantId: string;
  readonly runId?: string;
  readonly runUsd?: number;
  readonly tenantDayUsd?: number;
  readonly toolUsd?: Readonly<Record<string, number>>;
  readonly defaultToolUsd?: number;
  readonly maxTurns?: number;
  readonly highImpactTools?: readonly string[];
  readonly maxModelClass?: ModelClass;
  readonly preferredModelClass?: ModelClass;
  readonly fromContract?: ContractSpendMandate | null;
}

export interface AuthorizeInput {
  readonly runId: string;
  readonly kind: "model" | "tool";
  readonly name: string;
  readonly context?: ContextParts;
  readonly estimatedUsd?: number;
  readonly modelClass?: ModelClass;
  readonly model?: string;
  readonly approved?: boolean;
  readonly solvable?: boolean;
  readonly scoped?: boolean;
  readonly valid?: boolean;
  readonly worth_it?: boolean;
}

export interface CommitInput {
  readonly clearanceId: string;
  readonly actualUsd?: number;
  readonly tokensIn?: number;
  readonly tokensOut?: number;
}
