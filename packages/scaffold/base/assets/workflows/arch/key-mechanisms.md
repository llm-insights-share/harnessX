# /hx-arch-key-mechanisms — key design mechanisms

You are running the **arch** stage task `key-mechanisms` (optional).

## Input
- Existing HLD overview.

## Steps
1. Document key mechanisms / ADRs in the HLD (or linked ADR files).
2. Follow **arch-authoring** Skill when bound.
3. `hx arch check --task key-mechanisms`.

## Output
- Substantive key-mechanisms / ADR content.

## Guardrails
- Org-level only; optional task — warn-OK when unbound.

## Done when
`hx arch check --task key-mechanisms` is green (or warn-only as allowed).
