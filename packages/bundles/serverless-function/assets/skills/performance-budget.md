# Skill: Performance Budgets (Serverless)

- Handler module budget: default < 150 lines; extract services when branching grows.
- Deployed artifact budget: default < 5MB zipped (excluding layers); document layer splits in design.md.
- p95 invocation time budget declared per function in design.md (default < 500ms excl. downstream I/O).
- perf-budget warnings: lazy-load SDK clients before raising size limits.
