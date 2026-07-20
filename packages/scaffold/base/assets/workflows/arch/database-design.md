# /hx-arch-database-design — database design

You are running the **arch** stage task `database-design`.

## Input
- Existing HLD overview.

## Steps
1. Fill「数据库设计」in `docs/architecture/overview.md`.
2. Follow **arch-authoring** Skill / HLD template section headings.
3. `hx arch check --task database-design`.

## Output
- Substantive database-design section in the org HLD.

## Guardrails
- Org-level architecture only — no application migrations in this task.

## Done when
`hx arch check --task database-design` is green.
