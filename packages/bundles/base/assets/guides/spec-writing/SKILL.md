# Skill: Writing EARS Delta Specs

How to write requirement text and scenarios that pass `spec-validate` and stay machine-verifiable.

## Requirement text (EARS)

- Shape: `WHEN <trigger>, THE SYSTEM SHALL <response>` (event-driven) or `THE SYSTEM SHALL <response>` (ubiquitous). Use `WHILE <state>` for state-driven and `IF <condition>, THEN THE SYSTEM SHALL` for unwanted behaviour.
- The response must be observable and measurable: name the status code, the field, the limit, the timeout. Banned vague words: quickly, appropriately, properly, robust, user-friendly, as needed.
- One behaviour per requirement. If you wrote "and" between two SHALLs, split it.

## Scenarios

- Every ADDED/MODIFIED requirement needs at least one `#### Scenario: <stable name>` block with GIVEN/WHEN/THEN bullets.
- Scenario names are contract identifiers: tests reference them verbatim (`Scenario: <name>` in the test title), and traceability matches on the exact string. Never rename a scenario casually — that orphans its tests.
- Cover the happy path plus the error/boundary cases that change behaviour (empty input, limit exceeded, unauthorized, concurrent update) — not every theoretical permutation.

## Delta discipline

- `## ADDED Requirements` for new behaviour; `## MODIFIED Requirements` must restate the FULL updated requirement (merge is replace-based — partial text silently loses the rest); `## REMOVED Requirements` lists header names only, with a one-line reason.
- Before writing MODIFIED/REMOVED, read the current main spec; copy the exact requirement header so the merge can find it.
- Keep one capability per spec file; if a change spans capabilities, write one delta file per capability directory.
