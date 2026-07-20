# /hx-test-test-case-design — test case design

You are running the **test** stage task `test-case-design`.

## Input
- Change id; specs/design from Context Pack.

## Steps
1. `hx test-cases init <change>` if missing; fill cases mapped to Scenario / AC.
2. `hx gate check <change> --stage test --task test-case-design`.
3. Human approve when required.

## Output
- Test-case artifacts for the change.

## Guardrails
- No production feature code in this task.

## Done when
Test-case-design gate is green (and approved when required).
