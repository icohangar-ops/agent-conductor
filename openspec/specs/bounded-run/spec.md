# bounded-run

Fail-closed spend mandates and kill switches for bounded autonomous runs,
with preflight cost preview and CHP-composed approval for high-impact tools.

## Requirements

### Requirement: Preflight context inspector
The system SHALL estimate tokens and USD cost for a prospective call,
broken down by system rules, history, tool schemas, and user prompt.
The estimate MUST be marked approximate and MUST document the token
heuristic and class rates.

#### Scenario: Breakdown by context class
- **WHEN** a client submits distinct system-rules, history, tool-schema, and user-prompt text
- **THEN** the preflight result includes a per-class token count, an output estimate, a model class, and a total USD figure marked approximate

### Requirement: Hard budget circuit breaker
The system SHALL enforce per-run, per-tool, and per-tenant/day USD ceilings
and MUST fail closed when a prospective estimate would meet or exceed a
remaining ceiling. A run without a valid spend mandate MUST NOT authorize
spend.

#### Scenario: Run ceiling stops the next call
- **WHEN** reserved-plus-settled run spend plus the next estimate exceeds the run ceiling
- **THEN** authorize returns HALT with reason `run_ceiling` and does not create a reservation

#### Scenario: Missing mandate fail-closes
- **WHEN** authorize is called for an unknown run id
- **THEN** the result is HALT and no reservation is created

### Requirement: Before and after ledger
The system SHALL append a ledger record before a model or tool call
(authorize) and after it (commit). Commit MUST reject a missing or
already-settled clearance id.

#### Scenario: Commit without authorize is rejected
- **WHEN** commit is called with an unknown clearance id
- **THEN** the result is HALT and no settled spend is recorded

#### Scenario: Authorize then commit is ledgered
- **WHEN** a call is authorized and then committed
- **THEN** the ledger contains a `before` entry and an `after` entry for that clearance

### Requirement: High-impact pause-and-approve
High-impact tools SHALL NOT be authorized until a human approval is
recorded. When a decision gate is configured, approval MUST also pass
the CHP R0 gate.

#### Scenario: High-impact tool waits for approval
- **WHEN** authorize targets a high-impact tool that has not been approved
- **THEN** the result is APPROVE_REQUIRED and no reservation is created

### Requirement: Independent kill switch
The system SHALL refuse further authorize and begin operations after an
operator kill, without consulting a model.

#### Scenario: Kill blocks the next authorize
- **WHEN** the operator trips the kill switch for a run
- **THEN** a subsequent authorize for that run returns HALT with reason `kill_switch`

### Requirement: Model routing ledger and stuck-loop cap
The system SHALL record the chosen model class, the reason, and the cost
estimate for each model authorization. When the run's turn count reaches
the mandate's max-turns ceiling, further model authorizations MUST HALT.

#### Scenario: Turn cap stops a stuck loop
- **WHEN** a run has already authorized max-turns model calls
- **THEN** the next model authorize returns HALT with reason `stuck_loop`

### Requirement: Safe autonomous run recipe
The repository SHALL include an example recipe that starts a bounded run
and stops cleanly when a ceiling is hit.

#### Scenario: Recipe hits the ceiling and stops
- **WHEN** the safe-autonomous-run recipe is executed against a small run ceiling
- **THEN** it stops with a ceiling or turn-cap reason and performs no authorize after that HALT
