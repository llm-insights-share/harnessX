# Skill: Performance Budgets (Consumer Web)

- LCP budget: p75 < 2.5s on 4G for landing pages; document exceptions in design.md.
- Total JS per route chunk: default < 180KB gzip; marketing pages should be lower.
- Keep section modules under `maxFileLines`; extract shared components instead of duplicating markup.
- When perf-budget warns, fix asset weight and critical path before raising budgets.
