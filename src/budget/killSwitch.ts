/**
 * Operator kill switch. Process-local; the model is not consulted.
 *
 * A global trip (`trip()` with no run id) blocks every run, including
 * `begin`. A per-run trip blocks that run only. There is no MCP tool
 * that clears a trip — operators restart the server if they need a reset.
 */

export class KillSwitch {
  private globalTripped = false;
  private readonly runs = new Set<string>();
  private readonly reasons = new Map<string, string>();

  trip(runId?: string, reason = "operator_abort"): void {
    if (!runId || runId === "*") {
      this.globalTripped = true;
      this.reasons.set("*", reason);
      return;
    }
    this.runs.add(runId);
    this.reasons.set(runId, reason);
  }

  isTripped(runId?: string): boolean {
    if (this.globalTripped) return true;
    if (runId && this.runs.has(runId)) return true;
    return false;
  }

  reason(runId?: string): string | undefined {
    if (this.globalTripped) return this.reasons.get("*");
    if (runId) return this.reasons.get(runId);
    return undefined;
  }

  snapshot(): { global: boolean; runs: string[] } {
    return { global: this.globalTripped, runs: Array.from(this.runs) };
  }
}
