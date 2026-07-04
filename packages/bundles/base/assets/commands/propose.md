# /hx-propose — draft the proposal and initial delta specs

You are running the **propose** phase. The deliverables are a complete `proposal.md` and a first-cut delta spec that passes `spec-validate`.

## Steps

1. If the change workspace does not exist: `hx change create <kebab-name> --domains <d1,d2>`.
2. Scaffold artifacts: `hx propose <change> --title "<short imperative title>"`.
3. Fill EVERY section of `harnessX/changes/<change>/proposal.md`:
   - **Why** — the problem, 1–3 sentences, link tickets/incidents;
   - **What Changes** — observable behaviour changes as bullets; each bullet must map to a delta spec entry;
   - **Impact** — affected capabilities, code areas, breaking or not;
   - **Out of Scope** — what this change deliberately does NOT do.
   Delete all instruction comments and the `{{title}}` placeholder if present.
4. Rewrite the scaffolded delta spec at `harnessX/changes/<change>/specs/<capability>/spec.md`:
   - use `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements` sections;
   - every requirement text must be EARS-shaped (see the spec-writing skill): `WHEN <trigger>, THE SYSTEM SHALL <measurable response>`;
   - every ADDED/MODIFIED requirement needs at least one `#### Scenario:` block with GIVEN/WHEN/THEN bullets;
   - MODIFIED entries must contain the FULL updated requirement (merge is replace-based) — read the current main spec in `harnessX/specs/<capability>/spec.md` first.
5. Validate and iterate until green: `hx gate check <change> --phase spec`. Read each BLOCKER's `fix_hint` and fix the artifact, not the sensor.

## Guardrails

- Do not write implementation code or tests in this phase.
- Do not invent requirements that the user did not ask for; put nice-to-haves in Out of Scope.
- If ambiguity blocks you, list the open questions at the top of proposal.md and ask the human instead of guessing.

## Done when

`hx gate check <change> --phase spec` passes and a human could read proposal.md + delta specs and know exactly what behaviour will change.
