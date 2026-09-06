"""Smoke tests for the CHP bridge protocol. Run: python3 engine/test_bridge.py"""
import json
import os
import subprocess
import sys

BRIDGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bridge.py")


def run_bridge(requests):
    stdin = "\n".join(json.dumps(r) for r in requests) + "\n"
    proc = subprocess.run(
        [sys.executable, BRIDGE], input=stdin, capture_output=True, text=True, timeout=60
    )
    assert proc.returncode == 0, proc.stderr
    return [json.loads(line) for line in proc.stdout.strip().splitlines()]


def main():
    responses = run_bridge(
        [
            {"id": 1, "method": "ping", "params": {}},
            {"id": 2, "method": "r0_gate", "params": {"solvable": True, "scoped": True, "valid": True, "worth_it": True}},
            {"id": 6, "method": "r0_gate", "params": {"solvable": True, "scoped": True, "valid": True, "worth_it": True, "funded": False}},
            {"id": 3, "method": "adversary", "params": {"claim": "Test claim", "context": "test"}},
            {"id": 4, "method": "bogus", "params": {}},
            {"id": 5, "method": "adversary", "params": {}},
        ]
    )
    by_id = {r["id"]: r for r in responses}

    assert by_id[1]["result"]["ok"] is True
    assert by_id[2]["result"]["verdict"] == "PASS"
    assert by_id[6]["result"]["verdict"] == "HALT"
    assert by_id[6]["result"]["results"]["Funded"] == "FATAL"
    assert isinstance(by_id[3]["result"]["foundation_score"], int)
    assert by_id[3]["result"]["findings"], "adversary pass should produce findings"
    assert "unknown method" in by_id[4]["error"]
    assert "required" in by_id[5]["error"]

    print(f"ok — {len(responses)} bridge responses validated")


if __name__ == "__main__":
    main()
