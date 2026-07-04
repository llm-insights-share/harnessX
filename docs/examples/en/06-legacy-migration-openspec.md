# Scenario 06: Legacy Project Migration — OpenSpec Import and Backfilling Specs

## Background

Member system (member-service) is a three-year-old project: half the team started using OpenSpec last year (`openspec/` has 7 capability specs and 2 in-progress changes); half the code never had specs. Team decides full migration to HarnessX with requirements:

1. **Preserve** existing OpenSpec assets and in-progress work without interruption;
2. For legacy code without specs, **incrementally** backfill specs — not a "spec big bang" stop-the-line effort.

## Steps

### 1. Import OpenSpec assets

```console
$ cd member-service
$ hx openspec import --from openspec
Imported specs: member-account, member-points, member-level, member-benefits, member-signin, member-referral, member-tags
Imported changes: points-expiry, level-downgrade
  note: seeded meta.yaml for imported change "points-expiry"
  note: seeded meta.yaml for imported change "level-downgrade"
  note: imported project.md as constitution.md
```

Import performs three mappings:

- `openspec/specs/<cap>/spec.md` → `harnessX/specs/<cap>/spec.md` (format compatible; Requirement/Scenario structure reusable);
- in-progress changes moved to `harnessX/changes/` with touched domains inferred from deltas, meta.yaml seeded (initial state proposed; owners align with `hx gate advance`);
- `openspec/project.md` becomes `constitution.md` draft; team trims to 5–10 principles.

> Alternative: if not ready to move directories, set `compat_mode: openspec` in `config.yaml` — HarnessX uses `openspec/` as workspace; both tools coexist short term.

Then complete scenario 01 steps: `hx hooks install`, `hx ci init`, `hx adapter sync`.

### 2. Baseline inventory: sync drift detection

```console
$ hx sync
[scenario-without-test] Scenario: points frozen during dispute (member-points/Points freeze)
  → Spec declares "points frozen during dispute" but no test references it. Either the behaviour regressed (fix code/tests) or the spec is stale (open a change with a REMOVED/MODIFIED delta).
[scenario-without-test] Scenario: referral reward capped monthly (member-referral/Referral reward)
  → ...
[test-without-scenario] Scenario: vip auto renewal
  → Tests reference "Scenario: vip auto renewal" but no archived spec declares it. Backfill the spec via a change (ADDED delta) or rename the test.
```

Three drift types, three responses:

| Drift | Meaning | Action |
| --- | --- | --- |
| Spec yes, test no | Behavior may have regressed, or spec stale | Investigate: still needed → add test; not needed → change with `REMOVED` delta |
| Test yes, spec no | Undocumented "shadow behavior" | Change with `ADDED` delta to backfill spec (next step) |
| Neither (pure legacy) | sync cannot see | "Touch-and-backfill" incremental coverage (step 4) |

### 3. Backfill shadow behavior: VIP auto-renewal example

`vip auto renewal` has tests and code, no spec. Liu opens dedicated backfill change — **note: backfill spec does not change code**:

```console
$ hx change create backfill-vip-renewal --domains member-benefits
```

"Archaeology" (extract existing behavior from code and tests including edge cases) is agent strength. Liu tasks in Cursor, explicit this is "document current behavior" not "design new behavior":

```text
Cursor ▸ /hx-propose backfill-vip-renewal
         This is a spec backfill change: write existing behavior from
         @src/benefits/autoRenewal.ts and @tests/benefits/autoRenewal.test.ts
         into EARS spec verbatim. Do not change any code; if behavior looks
         suspicious, record in proposal open questions only.
```

Agent delta after reading code (Liu verifies "documents current behavior, not agent's ideal"):

```markdown
## ADDED Requirements

### Requirement: VIP auto-renewal
WHEN VIP expires within 24 hours and user has auto-renewal on and payment succeeds, THE SYSTEM SHALL extend membership 31 days and send renewal success notification.

#### Scenario: vip auto renewal
- GIVEN 24h before expiry, auto-renewal on, sufficient balance
- WHEN renewal job runs
- THEN membership +31 days, notification sent

#### Scenario: renewal skipped when payment fails
- GIVEN payment fails
- WHEN renewal job runs
- THEN membership unchanged, retry after 24h, auto-renewal off after 3 consecutive failures
```

Second Scenario is retry logic found during archaeology — **backfill value**: implicit code decisions made explicit. Existing test file gets `Scenario:` labels; `hx verify` passes; archive → behavior now documented.

### 4. Incremental strategy: touch-and-backfill

Team adds to constitution:

```markdown
6. Changes touching legacy modules without specs MUST include ADDED delta for touched behavior in the same change ("touch-and-backfill").
```

Nightly CI cron runs `hx janitor run`; drift list in patrol report; three months later sync output drops from 41 to 6 items.

### 5. Finish imported in-progress changes

Imported `points-expiry` had code done in old flow. Owner fills gaps and archives:

```console
$ hx trace check points-expiry
points-expiry: 3 covered, 0 waived, 1 uncovered
  UNCOVERED member-points/Points expiry — Scenario: expiry notification sent 7 days ahead
# after adding notification test:
$ hx verify points-expiry
VERIFIED
$ hx archive points-expiry
Merged capabilities: member-points
```

## Key mechanisms

- **Minimal-intrusion migration**: import rewrites no spec content — moves locations, adds management metadata (meta.yaml). Team uses new flow day one, not two-week migration stop.
- **sync as debt dashboard**: does not block (unlike gates) — keeps spec debt visible. Blocking stays on increments: new change verify gate blocks as usual.
- **Backfill spec ≠ wiki doc**: backfill output is verifiable (EARS + Scenario→test mapping); regressions caught by verify — essential difference from "write a wiki page".
