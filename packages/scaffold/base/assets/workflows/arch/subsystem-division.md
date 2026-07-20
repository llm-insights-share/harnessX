# /hx-arch-subsystem-division — global HLD + registry

You are running the **arch** stage task `subsystem-division`.

## Input
- System title; approved PRDs as context.

## Steps
1. Scaffold: `hx arch init --title "<system>"` if missing.
2. Fill global HLD boundaries, modules, flows, NFR, ADR; keep `registry.yaml` in sync.
3. Follow **arch-authoring** Skill / HLD template.
4. `hx arch check --task subsystem-division`.
5. Human: `hx gate approve --gate arch --approver <name>`.

## Output
- `docs/architecture/overview.md` + `registry.yaml`.

## Guardrails
- Org-level only — no change design or application code.

## Done when
Subsystem-division check is green and HLD is human-approved when required.
