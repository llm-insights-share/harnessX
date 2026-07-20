# /hx-arch-interface-design — external interface design

You are running the **arch** stage task `interface-design`.

## Input
- Existing HLD overview.

## Steps
1. Fill external / inter-system interface section in `docs/architecture/overview.md`.
2. Follow **arch-authoring** Skill / HLD template section headings.
3. `hx arch check --task interface-design`.

## Output
- Substantive interface-design section in the org HLD.

## Guardrails
- Org-level architecture only — no change OpenAPI fragments here.

## Done when
`hx arch check --task interface-design` is green.
