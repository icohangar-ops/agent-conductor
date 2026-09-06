"""agent-conductor decision engine bridge.

Exposes the vendored Consensus Hardening Protocol (CHP) core over a
newline-delimited JSON protocol on stdin/stdout, so the TypeScript MCP
server can gate decisions without an HTTP dependency.

Request:  {"id": <any>, "method": "<name>", "params": {...}}
Response: {"id": <any>, "result": {...}} | {"id": <any>, "error": "<message>"}

Methods:
    ping       -> {"ok": true, "engine": "chp", "version": ...}
    r0_gate    -> params: solvable, scoped, valid, worth_it (booleans);
                  optional funded (bool) adds a Funded PASS/FATAL row
                  result: {"verdict": "PASS"|"HALT", "results": {...}}
    adversary  -> params: claim (str), context (str, optional),
                  high_stakes (bool, default true)
                  result: {"status", "foundation_score", "findings",
                           "verification_failures", "report"}

Run: python3 engine/bridge.py   (reads stdin until EOF)
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor"))

from cme import __version__ as CME_VERSION  # noqa: E402
from cme.chp.gates import evaluate_r0_gate  # noqa: E402
from cme.chp.runner import TriangulationRunner  # noqa: E402


def handle_ping(params):
    return {"ok": True, "engine": "chp", "version": CME_VERSION}


def handle_r0_gate(params):
    gate = evaluate_r0_gate(
        solvable=bool(params.get("solvable", False)),
        scoped=bool(params.get("scoped", False)),
        valid=bool(params.get("valid", False)),
        worth_it=bool(params.get("worth_it", False)),
    )
    results = dict(gate.results)
    # Optional spend-mandate criterion. Composed here (not in vendored
    # gates.py) so a budget fail-close participates in the existing R0
    # HALT path without forking CHP.
    if "funded" in params:
        results["Funded"] = "PASS" if params.get("funded") else "FATAL"
    verdict = (
        "PASS" if all(value == "PASS" for value in results.values()) else "HALT"
    )
    return {"verdict": verdict, "results": results}


def handle_adversary(params):
    claim = params.get("claim")
    if not claim:
        raise ValueError("'claim' is required")
    result = TriangulationRunner.as_adversary(
        claim,
        context=params.get("context", ""),
        high_stakes=bool(params.get("high_stakes", True)),
    )
    verification_failures = (
        result.verification.failures() if result.verification else []
    )
    return {
        "status": result.status.value,
        "foundation_score": result.report.case.foundation_score,
        "findings": list(result.adversary_findings),
        "verification_failures": verification_failures,
        "report": result.render(),
    }


HANDLERS = {
    "ping": handle_ping,
    "r0_gate": handle_r0_gate,
    "adversary": handle_adversary,
}


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            handler = HANDLERS.get(request.get("method"))
            if handler is None:
                raise ValueError(f"unknown method: {request.get('method')!r}")
            response = {"id": request_id, "result": handler(request.get("params") or {})}
        except Exception as exc:  # surface every failure to the client, keep serving
            response = {"id": request_id, "error": str(exc)}
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
