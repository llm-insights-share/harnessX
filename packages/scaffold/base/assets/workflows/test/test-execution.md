# /hx-test-test-execution — UAT / bugs / report

You are running the **test** stage task `test-execution`.

## Input
- Change id with approved test cases.

## Steps
1. Execute cases; record UAT / bugs; `hx test report init <change>` if needed.
2. `hx gate check <change> --stage test --task test-execution`.

## Output
- UAT evidence, closed bugs, test report.

## Guardrails
- Do not waive failed cases without human-recorded waiver/policy.

## Done when
`hx gate check <change> --stage test --task test-execution` is green.
