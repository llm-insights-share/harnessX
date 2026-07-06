# Skill: Data Pipeline Design

- Every pipeline job declares input/output schema contracts in design.md (versioned).
- Transforms are pure where possible; side effects (writes) happen in job orchestration layer.
- Idempotent writes and partition keys documented per Scenario (replay-safe).
- Data quality checks (null rate, row counts) are explicit Scenarios — not ad-hoc asserts in jobs.
- PII columns tagged in schema; redaction rules referenced in delta specs.
