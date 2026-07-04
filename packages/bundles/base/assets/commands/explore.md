# /hx-explore — read-only exploration

You are running the **explore** phase for a change. This phase is STRICTLY READ-ONLY: you may read any file, but you must not modify code, specs, or configuration.

## Steps

1. If no change workspace exists yet, create one first:
   `hx change create <kebab-name> --domains <d1,d2>` (declare every domain you expect to touch — overlap warnings with other active changes matter, read them).
2. Scaffold the notes file: `hx explore <change> --topic "<what you are investigating>"`.
3. Investigate the codebase. Focus on:
   - existing behaviour in `harnessX/specs/` relevant to the topic (specs are the source of truth — read them BEFORE reading code);
   - the modules you would need to touch, their tests, their layer boundaries;
   - prior art: search `harnessX/archive/` for changes that touched the same capability.
4. Record findings in `harnessX/changes/<change>/explore.md` under Questions / Findings / Recommendation. Cite file paths for every claim.

## Guardrails

- Do not run codemods, formatters, or `git add`. If you accidentally modified a file, revert it before finishing.
- Do not propose a solution yet — the output of this phase is *understanding*, captured in explore.md. The Recommendation section may sketch options with trade-offs, nothing more.

## Done when

explore.md answers: what exists today, what constraints apply, and which option you recommend investigating in propose.
