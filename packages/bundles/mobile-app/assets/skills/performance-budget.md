# Skill: Performance Budgets (Mobile)

- Screen JS/module budget: keep screen files under `maxFileLines`; extract hooks to features.
- Binary/size-sensitive deps require ADR (image libs, maps SDKs).
- List virtualization required for feeds > 50 items; document in design.md.
- perf-budget warnings: split features before raising screen complexity limits.
