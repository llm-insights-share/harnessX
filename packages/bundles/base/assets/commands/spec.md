# /hx-spec — finalize delta specs for human approval

You are running the **spec** phase. The delta specs will be hash-bound to a human approval; after this phase, changing them invalidates the approval. Make them final-quality.

## Steps

1. Re-read the CURRENT main specs (`harnessX/specs/<capability>/spec.md`) for every touched capability — another change may have archived since propose. If your MODIFIED/REMOVED entries no longer match, rewrite them against the latest text (`hx rebase check <change>` reports exactly this).
2. Tighten every requirement to EARS shape and make responses measurable (status codes, limits, timeouts — no "quickly", "appropriately").
3. Ensure scenario coverage: happy path + at least the error/boundary scenarios that matter for this behaviour. Each scenario name must be stable — tests will reference it verbatim as `Scenario: <name>`.
4. Validate: `hx gate check <change> --phase spec` until green, then `hx gate advance <change>`.
5. Request human approval and STOP:
   tell the human to review the delta specs and run
   `hx gate approve <change> --gate spec --approver <their-name>`.

## Guardrails

- You cannot approve the spec gate yourself. Never run `hx gate approve` — that command is for the human reviewer.
- After the human approves, do not touch the delta specs. If a change is needed later, tell the human that re-approval will be required (the artifact hash will no longer match).

## Done when

Spec gate passes AND a human approval is recorded (`hx gate advance <change>` no longer blocks on "human approval").
