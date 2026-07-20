# /hx-dev-design — change HLD/LLD + finalize delta specs

You are running the **dev** stage task `design`. Precondition: propose gate green.

## Input
- Change id; org architecture from Context Pack.

## Steps
1. Scaffold: `hx design <change>` into `design/overview.md` and LLD dirs.
2. Fill HLD/LLD (UI/API/data) using **design-template**, **fe-layout**, **design-tokens**.
3. Finalize delta specs (EARS, measurable responses, stable `Scenario:` names); run `hx rebase check <change>` if main specs drifted.
4. `hx gate check <change> --stage dev --task design`.
5. Human (when required): `hx gate approve <change> --gate spec --approver <name>` — agents must not self-approve.

## Output
- Change `design/` package + final-quality delta specs.

## Guardrails
- No production code; schemas/pseudocode in `design/` only.
- After human spec approval, do not edit delta specs without re-approval.

## Done when
Design gate is green and any required human spec approval is recorded.
