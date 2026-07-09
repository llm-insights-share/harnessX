# /hx-design — HLD + LLD (overview + detailed design packages)

You are running the **design** phase. Precondition: proposal is complete.

## Steps

1. Scaffold: `hx design <change>` — renders `design-template` into `design/overview.md` and LLD directories.
2. Read **Org architecture HLD** and **module LLD** from the Context Pack (`docs/architecture/`).
3. Fill **HLD** in `design/overview.md` (from design-template): Context, API Surface, Data Model, ADR, Architecture Constraints, Observability, Rollback, UI Layout, Design Tokens.
4. Fill **LLD** under `design/`:
   - `design/ui/pages.md` — page inventory (route, layout shell);
   - `design/ui/components/<page-slug>.md` — per new page/component (props, states, a11y, tokens);
   - `design/api/*.yaml` — OpenAPI fragments for new endpoints;
   - `design/data/*.sql` — schema/migration notes when needed.
5. Follow **fe-layout** and **design-tokens** Skills; align API table with delta specs.
6. Update delta specs if design reveals new scenarios; run `hx gate check <change> --phase design` (enterprise: `arch-approved`, HLD/LLD/align sensors).
7. `hx gate advance <change>` when green.

## Guardrails

- No production code; pseudocode and schemas in design/ only.
- Every new REST row in API Surface must appear in delta specs before spec approval.

## Done when

HLD sections complete, LLD files exist for new UI/API surfaces, and design gates pass.
