# /hx-req-biz-understanding — business understanding

You are running the **req** stage task `biz-understanding`.

## Input
- Business notes, stakeholder context, or problem background from the user.

## Steps
1. Capture problem context, stakeholders, and constraints (notes are OK if no PRD slug yet).
2. Follow bound Skills when present (e.g. requirements-research-outline).
3. `hx req check --task biz-understanding` (warn-OK for optional gaps).

## Output
- Business-understanding notes under `docs/prd/` (or agreed path).

## Guardrails
- Org-level only — no change workspace, delta specs, or code.
- Optional task: do not block the delivery pipeline on warn-level gaps.

## Done when
`hx req check --task biz-understanding` is green (or warn-only as allowed).
