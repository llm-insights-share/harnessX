# /hx-dev-propose — proposal + initial delta specs

You are running the **dev** stage task `propose`.

## Input
- Change id (create if needed); org PRD reference.

## Steps
1. `hx change create <kebab-name> --domains <d1,d2>` if missing.
2. `hx propose <change> --title "<imperative title>"` then fill `requirements/*`, `proposal.md`, delta specs.
3. Follow **prd-writing** / **spec-writing** Skills and bound templates.
4. `hx gate check <change> --stage dev --task propose`.

## Output
- `proposal.md`, `requirements/*`, initial delta specs, delivery-trace scaffold.

## Guardrails
- No implementation code or tests.
- Do not invent PRD requirements — use Out of Scope / Open Questions.

## Done when
`hx gate check <change> --stage dev --task propose` is green.
