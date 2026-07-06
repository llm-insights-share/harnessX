# Skill: Performance Budgets (Data Pipeline)

- Job modules stay under `maxFileLines`; split stages instead of monolithic transforms.
- Batch SLA and max partition size documented in design.md (default: process windows < 15m).
- Source connectors must not load unbounded datasets into memory — stream or chunk.
- perf-budget warnings require partitioning plan before raising file/size limits.
