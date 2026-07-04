# /hx-verify — full verification and traceability

You are running the **verify** phase: full sensor suite + scenario-to-test traceability. This gate is fail-closed — a sensor crash counts as failure.

## Steps

1. Run `hx verify <change>`. It executes the verification suite AND checks that every scenario in the delta specs is covered by at least one test (matched on the verbatim `Scenario:` string).
2. For each uncovered scenario: either the test exists but does not reference the scenario string (fix the test name / add the reference), or the test is genuinely missing (go back and write it — do not skip).
3. For each sensor failure: run `hx fix <change>` to get a focused pack (failing report, relevant spec section, code excerpt), fix the code, re-run `hx verify <change>`.
4. If a finding is a genuine false positive or an accepted risk, do NOT edit the sensor. Ask the human to record a waiver:
   `hx waiver add <change> --sensor <id> --reason "<why>" --expires <YYYY-MM-DD>` — waivers are time-boxed and audited.
5. When green: `hx gate advance <change>`.

## Guardrails

- Never edit sensor configs, rubric rules, or suite definitions to make verification pass. Harness changes go through their own review, not through your change.
- Do not lower coverage by deleting tests; traceability compares against the spec, and sync checks will flag drift later anyway.

## Done when

`hx verify <change>` reports pass with zero uncovered scenarios, and the gate advances to archive-ready.
