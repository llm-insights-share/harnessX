# /hx-dev-verify — verification + scenario traceability

You are running the **dev** stage task `verify`.

## Input
- Change id ready for full suite.

## Steps
1. `hx verify <change>` (suite + Scenario coverage).
2. Fix gaps via `hx fix <change>`; waivers only by human: `hx waiver add …`.
3. `hx gate check <change> --stage dev --task verify` then advance when green.

## Output
- Green verification suite with full scenario coverage.

## Guardrails
- Never edit sensor/suite configs to force a pass.
- Do not delete tests to lower coverage.

## Done when
`hx verify <change>` / verify gate is green with zero uncovered scenarios.
