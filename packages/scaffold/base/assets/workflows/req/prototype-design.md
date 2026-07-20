# /hx-req-prototype-design — prototype design

You are running the **req** stage task `prototype-design`.

## Input
- PRD slug; analysis / PRD draft as available.

## Steps
1. Scaffold: `hx req prototype init <slug>` if missing.
2. Fill page inventory / wireframe notes in `docs/prd/<slug>/prototype/pages.md`.
3. Follow **prototype-wireframe** Skill when bound.
4. `hx req check --task prototype-design --prd <slug>`.

## Output
- Org-level prototype page inventory.

## Guardrails
- Org-level only — no production UI code.

## Done when
`hx req check --task prototype-design --prd <slug>` is green.
