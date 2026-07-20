# /hx-dev-archive — merge deltas and close change

You are running the **dev** stage task `archive`.

## Input
- Change id that passed verify.

## Steps
1. `hx rebase check <change>`; enterprise: `hx arch promote <change>` when required.
2. `hx archive <change>` — merge deltas, write `retro.md`, move to archive.
3. Review retro; commit archive separately for auditable spec history.

## Output
- Updated `harnessX/specs/`; change under `harnessX/archive/`.

## Guardrails
- Never hand-edit main specs to "help" the merge — fix conflicts in the delta.
- Resolve merge conflicts in the delta spec, not in main specs.

## Done when
Change is archived and `hx status` no longer lists it as active.
