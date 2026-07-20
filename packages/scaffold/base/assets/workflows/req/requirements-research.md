# /hx-req-requirements-research — requirements research

You are running the **req** stage task `requirements-research`.

## Input
- PRD slug and stakeholder / research materials.

## Steps
1. Scaffold: `hx req research init <slug>` if missing.
2. Fill stakeholder list, methods, findings, and open questions in `docs/prd/<slug>/research.md` (or scaffold path).
3. Follow bound Skills (e.g. requirements-research-outline).
4. `hx req check --task requirements-research --prd <slug>`.

## Output
- Org-level research sidecar for `<slug>`.

## Guardrails
- Org-level only — no change explore notes, delta specs, or code.
- Cite sources for every material finding.

## Done when
`hx req check --task requirements-research --prd <slug>` is green.
