# /hx-archive — merge deltas into main specs and close the change

You are running the **archive** phase. This merges the change's delta specs into `harnessX/specs/` (the living truth) and moves the change to `harnessX/archive/`.

## Steps

1. Pre-flight: `hx rebase check <change>`. If another change archived first and your MODIFIED/REMOVED entries no longer match the current main spec text, update the delta entries to target the latest text, get the human to re-approve if the spec gate approval is invalidated, then retry.
2. Archive: `hx archive <change>`. This will:
   - merge ADDED/MODIFIED/REMOVED into the main capability specs;
   - write a `retro.md` summarizing gate history, waivers, and sensor failures for the steering loop;
   - move the change directory into `harnessX/archive/`.
3. Review the generated retro.md. If the same sensor failed 3+ times during this change, note it — `hx steer report` will surface it as a candidate for a new guide or sensor.
4. Commit the archive as its own commit so the spec history stays auditable.

## Guardrails

- Never hand-edit `harnessX/specs/` directly to "help" the merge; only the archive merge writes main specs.
- If the merge reports a conflict, resolve it in the DELTA spec, not in the main spec.

## Done when

The change lives in `harnessX/archive/`, main specs reflect the new behaviour, and `hx status` no longer lists the change as active.
