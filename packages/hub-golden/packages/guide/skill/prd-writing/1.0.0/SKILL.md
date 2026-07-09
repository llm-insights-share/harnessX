# Skill: PRD → Harness Distillation

When moving from org PRD to Harness artifacts:

1. Read `docs/prd/<feature>.md` (or user `@` reference) before writing `proposal.md`.
2. Map each PRD acceptance criterion to exactly one delta spec `Requirement` (record AC id in `delivery-trace.yaml`).
3. Put product-only narrative in `requirements/prd-summary.md` and `requirements/user-stories.md`.
4. Put NFR (latency, security, compliance) in `requirements/nfr.md` and reflect measurable parts in delta specs.
5. Do not invent requirements absent from PRD — list them in Out of Scope or Open Questions.
6. UI pages mentioned in PRD must appear in `design/ui/pages.md` during the design phase.
