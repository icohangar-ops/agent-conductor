# Vendored code notice

## cme/ — Consensus Hardening Protocol core

- **Upstream:** https://codeberg.org/cubiczan/consensus-hardening-protocol
- **License:** MIT (Copyright (c) 2026 zan-maker)
- **Vendored:** 2026-06-11, upstream default branch
- **Contents:** `protocol.py`, `context.py`, `playbook.py`, `bridge.py`,
  `agent.py`, `orchestrator.py`, and the `chp/` subpackage — byte-identical
  to upstream.
- **Local modifications:** `cme/__init__.py` only — drops imports of the
  excluded domain packages (`finance/`, `cfo_os/`, `demo/`, `cli.py`) and
  tags the version as `0.1.0+conductor`.

Do not edit vendored files. Engine-side behavior changes belong in
`engine/bridge.py`; protocol fixes belong upstream.
