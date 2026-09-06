/**
 * Policy-based model routing.
 *
 * Reuses CHP ModelTier names and the same name tokens as
 * `engine/vendor/cme/chp/parity.py` `_infer_tier` so a requested model
 * string classifies the same way the Python engine would.
 */

import { DEFAULT_MODEL_BY_CLASS } from "./estimator.ts";
import type { ModelClass, RouteDecision } from "./types.ts";

const CLASS_RANK: Record<ModelClass, number> = {
  small: 0,
  mid: 1,
  high: 2,
  frontier: 3,
};

const CLASS_BY_RANK: ModelClass[] = ["small", "mid", "high", "frontier"];

export function rankOf(modelClass: ModelClass): number {
  return CLASS_RANK[modelClass];
}

export function inferModelClass(modelName: string): ModelClass | undefined {
  const name = modelName.toLowerCase();
  if (!name) return undefined;
  // Same token lists as engine/vendor/cme/chp/parity.py `_infer_tier`.
  if (["opus", "max", "frontier"].some((token) => name.includes(token))) return "frontier";
  if (["gpt-5", "claude 4", "claude-4", "high"].some((token) => name.includes(token))) return "high";
  if (["sonnet", "4o", "mid", "gpt-4"].some((token) => name.includes(token))) return "mid";
  if (["mini", "small", "haiku"].some((token) => name.includes(token))) return "small";
  return undefined;
}

export function minClass(a: ModelClass, b: ModelClass): ModelClass {
  return CLASS_RANK[a] <= CLASS_RANK[b] ? a : b;
}

export interface RouteInput {
  readonly preferred: ModelClass;
  readonly maxClass: ModelClass;
  readonly requestedModel?: string;
  readonly requestedClass?: ModelClass;
  readonly taskHint?: string;
}

export function routeModel(input: RouteInput): RouteDecision {
  const requestedClass =
    input.requestedClass ??
    (input.requestedModel ? inferModelClass(input.requestedModel) : undefined);

  let chosen = requestedClass ?? hintClass(input.taskHint) ?? input.preferred;
  let capped = false;
  let reason: string;

  if (CLASS_RANK[chosen] > CLASS_RANK[input.maxClass]) {
    chosen = input.maxClass;
    capped = true;
    reason = `requested ${requestedClass ?? chosen} exceeds mandate.maxModelClass=${input.maxClass}; routed down`;
  } else if (requestedClass) {
    reason = `requested class ${requestedClass}` + (input.requestedModel ? ` (${input.requestedModel})` : "");
  } else if (input.taskHint && hintClass(input.taskHint)) {
    reason = `task hint "${input.taskHint}" → ${chosen}; preferred ${input.preferred}`;
  } else {
    reason = `mandate preferred class ${input.preferred}`;
  }

  const model =
    input.requestedModel && !capped && inferModelClass(input.requestedModel) === chosen
      ? input.requestedModel
      : DEFAULT_MODEL_BY_CLASS[chosen];

  return {
    model,
    modelClass: chosen,
    reason,
    requestedClass,
    capped,
  };
}

function hintClass(taskHint?: string): ModelClass | undefined {
  if (!taskHint) return undefined;
  const t = taskHint.toLowerCase();
  if (/(refactor|architect|adversar|high.?stakes|security)/.test(t)) return "high";
  if (/(review|summar|classif|format|lint)/.test(t)) return "small";
  return undefined;
}

export function classAtOrBelow(maxClass: ModelClass): ModelClass[] {
  return CLASS_BY_RANK.filter((c) => CLASS_RANK[c] <= CLASS_RANK[maxClass]);
}
