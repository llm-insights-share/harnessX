# /hx-propose — draft the proposal and initial delta specs

You are running the **propose** phase. Deliverables: `requirements/*`, `proposal.md`, initial delta spec, and `traces/delivery-trace.yaml` scaffold.

## Steps

1. If the change workspace does not exist: `hx change create <kebab-name> --domains <d1,d2>`.
2. Read the org PRD (`docs/prd/<feature>.md` or user `@` reference) per **prd-writing** Skill.
3. Scaffold: `hx propose <change> --title "<short imperative title>"` (creates proposal, requirements/, delta draft, delivery-trace).
4. Fill `requirements/prd-summary.md`, `user-stories.md`, `nfr.md` from the PRD.
5. Fill EVERY section of `proposal.md` including **PRD Reference**; map each What Changes bullet to a PRD AC id.
6. Rewrite the delta spec at `harnessX/changes/<change>/specs/<capability>/spec.md` (EARS + scenarios — see spec-writing Skill).
7. Validate: `hx gate check <change> --phase propose` (enterprise: `prd-complete`, `prd-approved`, `requirements-complete`).

## Guardrails

- No implementation code or tests in this phase.
- Do not invent PRD requirements — use Out of Scope or Open Questions.
- If ambiguity blocks you, ask the human.

## Done when

Requirements artifacts exist, proposal + delta spec pass gates, and a human can see what behaviour will change.
