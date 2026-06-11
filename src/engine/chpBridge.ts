/**
 * Agent Conductor — CHP decision engine client.
 *
 * Talks to the vendored Consensus Hardening Protocol core
 * (engine/bridge.py) over newline-delimited JSON on a child process's
 * stdio. The process starts lazily on first call and is reused.
 */

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../utils/logger.ts";

export interface R0GateInput {
  solvable: boolean;
  scoped: boolean;
  valid: boolean;
  worth_it: boolean;
}

export interface R0GateResult {
  verdict: "PASS" | "HALT";
  results: Record<string, "PASS" | "FATAL">;
}

export interface AdversaryInput {
  claim: string;
  context?: string;
  high_stakes?: boolean;
}

export interface AdversaryResult {
  status: string;
  foundation_score: number;
  findings: string[];
  verification_failures: string[];
  report: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

const ENGINE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "engine");

export class ChpBridge {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private readonly pythonBin: string;
  private readonly bridgePath: string;

  constructor(pythonBin?: string, bridgePath?: string) {
    this.pythonBin = pythonBin ?? process.env.CONDUCTOR_PYTHON ?? "python3";
    this.bridgePath = bridgePath ?? join(ENGINE_DIR, "bridge.py");
  }

  private start(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;

    const child = spawn(this.pythonBin, [this.bridgePath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stderr.on("data", (chunk: Buffer) => logger.warn(`engine: ${chunk.toString().trim()}`));
    child.on("exit", (code) => {
      logger.warn(`engine exited (code ${code})`);
      for (const { reject } of this.pending.values()) {
        reject(new Error(`decision engine exited with code ${code}`));
      }
      this.pending.clear();
      this.child = null;
    });

    createInterface({ input: child.stdout }).on("line", (line) => {
      let response: { id?: number; result?: unknown; error?: string };
      try {
        response = JSON.parse(line);
      } catch {
        logger.warn(`engine sent unparseable line: ${line}`);
        return;
      }
      const pending = response.id !== undefined ? this.pending.get(response.id) : undefined;
      if (!pending) return;
      this.pending.delete(response.id!);
      if (response.error !== undefined) pending.reject(new Error(response.error));
      else pending.resolve(response.result);
    });

    this.child = child;
    return child;
  }

  private call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const child = this.start();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      child.stdin.write(JSON.stringify({ id, method, params }) + "\n", (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  ping(): Promise<{ ok: boolean; engine: string; version: string }> {
    return this.call("ping", {});
  }

  /** R0 gate: is this decision solvable, scoped, valid, and worth making at all? */
  r0Gate(input: R0GateInput): Promise<R0GateResult> {
    return this.call("r0_gate", { ...input });
  }

  /** One-shot adversarial pass: CHP attacks the claim's foundations. */
  adversary(input: AdversaryInput): Promise<AdversaryResult> {
    return this.call("adversary", { ...input });
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
  }
}

/** Shared engine client used by the MCP server. */
export const chpBridge = new ChpBridge();
