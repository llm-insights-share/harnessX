# /hx-req-prd-writing — organization-level PRD

You are running the **req** stage task `prd-writing`.

## Input
- PRD slug and title; research/analysis/prototype as available.

## Steps
1. Scaffold: `hx req prd init <slug> --title "<title>"` if missing.
2. Fill stories, GWT acceptance criteria, In/Out Scope, NFR per **prd-authoring** / **prd-writing** Skill.
3. `hx req check --task prd-writing --prd <slug>`.
4. Human: `hx gate approve --gate prd --prd <slug> --approver <name>`.

## Output
- `docs/prd/<slug>.md` (or scaffold path) + approval.

## Guardrails
- Org-level only — no change workspace, delta specs, or code.
- Do not invent requirements — use Open Questions.

## Done when
PRD check is green and human approval is recorded.
