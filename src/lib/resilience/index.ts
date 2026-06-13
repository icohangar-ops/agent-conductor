/**
 * Vendored subset of cubiczan-resilience (MIT). No npm registry is available,
 * so the primitives this repo needs are copied in-tree. Only the pieces used
 * by the CHP subprocess bridge are vendored: `withTimeout` and `ResilienceError`.
 */
export { ResilienceError, isResilienceError } from "./errors.ts";
export type { ResilienceErrorKind, ResilienceErrorOptions } from "./errors.ts";
export { withTimeout } from "./timeout.ts";
