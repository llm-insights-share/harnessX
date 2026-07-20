# /hx-arch-tech-selection — technology selection

You are running the **arch** stage task `tech-selection`.

## Input
- Existing HLD overview (create via `hx arch init` if missing).

## Steps
1. Fill「技术选型」in `docs/architecture/overview.md` with rationale and trade-offs.
2. Follow **arch-authoring** Skill / HLD template section headings.
3. `hx arch check --task tech-selection`.

## Output
- Substantive technology-selection section in the org HLD.

## Guardrails
- Org-level architecture only — no change design or application code.

## Done when
`hx arch check --task tech-selection` is green.
