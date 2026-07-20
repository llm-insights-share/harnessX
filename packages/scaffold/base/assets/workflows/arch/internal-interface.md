# /hx-arch-internal-interface — module LLD

You are running the **arch** stage task `internal-interface`.

## Input
- Module id from `registry.yaml`.

## Steps
1. Scaffold: `hx arch lld init <module> --title "..."` if missing.
2. Fill module LLD (boundaries, APIs, data, constraints).
3. `hx arch check --task internal-interface --module <module>`.
4. Human approve when required: `hx gate approve --gate arch-lld --module <module> --approver <name>`.

## Output
- Module LLD under `docs/architecture/modules/<module>/`.

## Guardrails
- Org-level module design only — no change `design/` package.

## Done when
Internal-interface check is green and LLD is approved when required.
