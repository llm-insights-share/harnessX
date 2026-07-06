# Skill: Performance Budgets (Event Consumers)

- Handler p95 processing time budget: default < 200ms per message (excluding I/O wait); record overrides in design.md.
- Keep handler modules under `maxFileLines`; extract processors for branching logic.
- Batch consumers must declare max batch size and memory ceiling in design.md.
- When perf-budget sensor warns, prefer splitting processors before raising budgets.
