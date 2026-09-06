/**
 * Approximate token / cost inspector.
 *
 * Heuristic (documented, not a real tokenizer):
 *   tokens ≈ ceil(chars / 4)
 *
 * Class rates are ballpark USD per million tokens, aligned with CHP
 * ModelTier names. They are NOT live provider prices. Clients SHOULD
 * pass actual tokens/USD on `run_commit` when the provider reports them.
 */

import type { ContextParts, CostBreakdown, ModelClass, RateCard, TokenBreakdown } from "./types.ts";

/** chars/token used for the dry-run inspector. */
export const CHARS_PER_TOKEN = 4;

/** Default output-token guess when the caller does not supply one. */
export const DEFAULT_OUTPUT_TOKENS = 256;

/**
 * Approximate USD / 1M tokens by CHP model class.
 * small ≈ haiku-class, mid ≈ sonnet/4o, high ≈ opus-high, frontier ≈ max.
 */
export const MODEL_RATES: Record<ModelClass, RateCard> = {
  small: { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  mid: { inputPerMTok: 3, outputPerMTok: 15 },
  high: { inputPerMTok: 15, outputPerMTok: 75 },
  frontier: { inputPerMTok: 25, outputPerMTok: 125 },
};

export const DEFAULT_MODEL_BY_CLASS: Record<ModelClass, string> = {
  small: "haiku",
  mid: "sonnet",
  high: "opus-high",
  frontier: "opus-max",
};

export const TOKEN_METHOD = "ceil(chars/4) — approximate, not a provider tokenizer";

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function usdFromTokens(tokens: number, usdPerMillion: number): number {
  return money((tokens / 1_000_000) * usdPerMillion);
}

/** Round to millionths of a dollar so ceiling math stays deterministic. */
export function money(value: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  return Math.round(value * 1e6) / 1e6;
}

export function breakdownTokens(parts: ContextParts): TokenBreakdown {
  const systemRules = estimateTokens(parts.systemRules ?? "");
  const history = estimateTokens(parts.history ?? "");
  const toolSchemas = estimateTokens(parts.toolSchemas ?? "");
  const userPrompt = estimateTokens(parts.userPrompt ?? "");
  const outputEstimate =
    parts.expectedOutputTokens !== undefined && Number.isFinite(parts.expectedOutputTokens)
      ? Math.max(0, Math.floor(parts.expectedOutputTokens))
      : DEFAULT_OUTPUT_TOKENS;
  const totalInput = systemRules + history + toolSchemas + userPrompt;
  return {
    systemRules,
    history,
    toolSchemas,
    userPrompt,
    outputEstimate,
    totalInput,
    total: totalInput + outputEstimate,
    method: TOKEN_METHOD,
  };
}

export function inspectContext(
  parts: ContextParts,
  modelClass: ModelClass,
  model?: string,
): CostBreakdown {
  const tokens = breakdownTokens(parts);
  const rates = MODEL_RATES[modelClass];
  const inputUsd = usdFromTokens(tokens.totalInput, rates.inputPerMTok);
  const outputUsd = usdFromTokens(tokens.outputEstimate, rates.outputPerMTok);
  return {
    tokens,
    modelClass,
    model: model ?? DEFAULT_MODEL_BY_CLASS[modelClass],
    inputUsd,
    outputUsd,
    totalUsd: money(inputUsd + outputUsd),
    rates,
    approximate: true,
  };
}

/** Flat proxy cost for a tool call when the client does not supply USD. */
export function estimateToolUsd(argsText: string, fallbackUsd: number): number {
  if (Number.isFinite(fallbackUsd) && fallbackUsd > 0) return money(fallbackUsd);
  const tokens = estimateTokens(argsText);
  return usdFromTokens(tokens, MODEL_RATES.small.inputPerMTok);
}
