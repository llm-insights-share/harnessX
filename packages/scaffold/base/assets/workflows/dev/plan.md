# /hx-dev-plan — dual-track tasks.md

You are running the **dev** stage task `plan`.

## Input
- Change id with design artifacts.

## Steps
1. `hx plan <change>` then refine `tasks.md` (`@design=`, `@files=`, Scenario names).
2. `hx gate check <change> --stage dev --task plan`.

## Output
- `tasks.md` with design handoff refs + synced delivery-trace.

## Guardrails
- Do not delete `[test]` tasks.
- Scenario names must match delta specs verbatim.

## Done when
`hx gate check <change> --stage dev --task plan` is green.
