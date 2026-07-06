# Skill: Performance Budgets (Frontend)

- Initial route JS budget: default < 250KB gzip per page chunk; document exceptions in design.md.
- Keep components under `maxFileLines`; extract hooks for stateful logic.
- Avoid importing heavy charting libraries in shared modules — lazy-load at page level.
- When perf-budget sensor warns, split components or defer non-critical imports.
