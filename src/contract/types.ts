/**
 * Agent Conductor — Contract types.
 *
 * An AgentContract is the compiled form of an AGENTS.md file: the
 * machine-actionable pieces (rules, gates, skills, layer boundaries,
 * optional spend mandate) extracted from the human-readable operating
 * manual.
 */

import type { ContractSpendMandate } from "../budget/types.ts";

export type { ContractSpendMandate, ModelClass } from "../budget/types.ts";

/** One markdown section, flattened with its heading level. */
export interface ContractSection {
  readonly heading: string;
  readonly level: number;
  readonly content: string;
}

/** A row from a layer-responsibilities table: where logic may and may not live. */
export interface LayerRule {
  readonly layer: string;
  readonly role: string;
  readonly do: string;
  readonly dont: string;
}

/** A named verification gate: shell commands that must succeed before handoff. */
export interface VerificationGate {
  readonly name: string;
  readonly commands: string[];
  readonly notes: string;
}

/** A skill the contract recommends, and when to reach for it. */
export interface SkillRecommendation {
  readonly task: string;
  readonly skill: string;
  readonly url: string;
  readonly why: string;
}

/** The compiled contract. */
export interface AgentContract {
  readonly source: string;
  readonly title: string;
  readonly mission: string;
  readonly rules: string[];
  readonly layers: LayerRule[];
  readonly gates: VerificationGate[];
  readonly skills: SkillRecommendation[];
  readonly outOfScope: string[];
  readonly spendMandate: ContractSpendMandate | null;
  readonly sections: ContractSection[];
}
