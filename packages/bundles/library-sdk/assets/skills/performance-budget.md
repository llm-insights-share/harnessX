# Skill: Performance Budgets (SDK)

- Published bundle size budget: default < 50KB minified per entry export (document multi-entry exceptions).
- Tree-shakeable exports only — no side effects on import unless documented in package.json `sideEffects`.
- Keep files under `maxFileLines`; split adapters into optional subpaths.
- perf-budget warnings require an ADR before raising published size limits.
