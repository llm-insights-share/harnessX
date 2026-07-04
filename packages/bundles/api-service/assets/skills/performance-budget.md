# Skill: Performance Budgets

- Endpoints must respond within their declared budget (default p95 < 300ms); add a budget entry before introducing slower operations.
- Keep modules under the `maxFileLines` budget; extract services rather than growing files.
- Any new dependency that adds >50KB to the bundle needs a note in design.md (ADR).
- When the perf-budget sensor warns, treat it as a design smell — do not raise budgets casually; raising a budget requires an ADR entry.
