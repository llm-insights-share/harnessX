# /hx-design — technical design with ADRs

You are running the **design** phase. Precondition: the proposal is complete (the design gate checks this and blocks otherwise).

## Steps

1. Scaffold: `hx design <change>` (this runs the propose-completeness gate first; fix blockers before continuing).
2. Fill `harnessX/changes/<change>/design.md`:
   - **Context** — constraints from explore.md and the current specs;
   - **Decisions (ADR)** — one ADR entry per significant decision: status, the decision itself, consequences. Record rejected alternatives and WHY they lost;
   - **Architecture Constraints** — rules that sensors should enforce afterwards (layer boundaries, dependency direction, budgets). Write them so they can be checked mechanically.
3. Cross-check against the constitution (`harnessX/constitution.md`) and any `guide.constraint` assets — if your design conflicts with a constraint, either change the design or open the conflict explicitly with the human. Do not silently violate.
4. If the design implies spec changes (new/changed scenarios), update the delta specs now and re-run `hx gate check <change> --phase spec`.
5. Advance when clean: `hx gate advance <change>`.

## Guardrails

- Design decisions that add new dependencies, new services, or cross-domain coupling must each have their own ADR entry.
- No code in this phase. Pseudocode and interface sketches inside design.md are fine.

## Done when

Every non-obvious implementation choice a coder (human or agent) would face in apply already has an answer or an ADR in design.md.
