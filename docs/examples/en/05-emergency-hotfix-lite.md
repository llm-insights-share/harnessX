# Scenario 05: Production Bug Hotfix via Lite Fast Lane
| | |
| --- | --- |
| **Journey** | Daily delivery |
| **Roles** | On-call |
| **Prerequisites** | Scenario(s) 01 |
| **Related** | [Scenario picker](00-scenario-picker.md) |

## Background

Friday 18:40, alert: coupon redemption API returns 500 for coupons "expired but expiry status not persisted" (should return 422). On-call Li needs a fix within 30 minutes. Standard full flow (design/spec/approval/plan) is unrealistic, but **fully bypassing harness leaves this fix outside the spec system** — three months later nobody knows if the behavior was intentional or accidental.

lite profile exists for this: keep only the `dev` stage with a minimal task set (commonly `propose/apply/archive`), and run fast-lite in apply.

## Steps

### 1. Create change, explicitly downgrade with audit trail

```console
$ hx change create hotfix-expired-coupon-500 --domains coupon-redemption --profile lite
Created change "hotfix-expired-coupon-500" (profile: lite, domains: coupon-redemption)
```

`coupon-redemption` is a constitutional core domain; recommendation is strict. Add downgrade record (on-call manager verbal approval, reason in repo):

```console
$ hx profile recommend hotfix-expired-coupon-500 --choose lite \
    --override-reason "P1 production incident INC-4521, on-call manager Wang approved lite; full spec within 48h (see step 5)"
recommended: strict (score 3)
  - touches core domain(s) coupon-redemption (+3)
profile set to lite (override: P1 production incident INC-4521, on-call manager Wang approved lite; full spec within 48h (see step 5))
```

### 2. Minimal proposal + minimal delta

lite does not exempt "say clearly what you change". Li feeds incident info to Cursor:

```text
Cursor ▸ /hx-propose hotfix-expired-coupon-500
         P1 incident INC-4521: redemption API returns 500 for coupons expired but expiry
         status not persisted; should return 422 + COUPON_EXPIRED. Fix this behavior only;
         everything else Out of Scope.
```

Agent drafts per command prompt: proposal.md in three sentences; delta spec one ADDED Requirement (self-runs `hx gate check` for format):

```markdown
## ADDED Requirements

### Requirement: Explicit rejection of expired coupon redemption
WHEN redemption hits a coupon whose expire_at is before now (regardless of whether expiry status is persisted), THE SYSTEM SHALL return 422 with error code COUPON_EXPIRED.

#### Scenario: expired-but-not-flagged coupon rejected
- GIVEN a coupon with expire_at passed but status still ACTIVE
- WHEN requesting redemption
- THEN return 422, body.code == COUPON_EXPIRED
```

**Value of this step**: expected fix behavior is frozen in spec and scenarios, not only in hotfix commit message.

### 3. apply + quick verification

For incident, Li stays in Cursor session watching (`/hx-apply hotfix-expired-coupon-500`, agent adds red test then fix, fast-lite suite each step), or headless loop:

```console
$ hx apply hotfix-expired-coupon-500 --runner 'cursor-agent --task "$HX_TASK_TITLE"' --max-retries 2
completed tasks: 01a, 01b; remaining: 0
```

fast-lite suite is only `spec-validate` + change-related unit tests (relevance heuristic picks tests by diff dependency graph, NFR-001), ~40 seconds total. Tests named by Scenario; traceability intact:

```typescript
it("Scenario: expired-but-not-flagged coupon rejected", async () => { ... });
```

### 4. archive --force and release

lite profile has no verify phase; change never reaches `verified`, so archive needs explicit `--force`:

```console
$ hx archive hotfix-expired-coupon-500 --force
Archived to harnessX/archive/2026-07-04-hotfix-expired-coupon-500
Merged capabilities: coupon-redemption
```

`--force` only skips "must be verified"; **delta merge, rebase conflict check, retro generation unchanged**. Release 19:25, incident closed.

### 5. Post-hoc catch-up (within 48 hours)

Monday, Li opens standard change per commitment for full spec and tests:

```console
$ hx change create expired-coupon-hardening --domains coupon-redemption
```

Content: extend Friday's single-Scenario requirement (concurrent redemption races, bulk redemption with expired coupons, etc.); fix temporary layer violations found by arch-boundary.

**Who ensures "post-hoc catch-up" is not forgotten?** Two mechanisms:

- Downgrade record forever in archived meta.yaml; monthly audit lists all `overrideReason` containing "post-hoc" without linked follow-up change;
- Waivers added during fix expire; `hx janitor run` nightly nags in report (scenario 07).

## Key mechanisms

- **Fast lane ≠ no governance**: lite keeps three non-negotiables — delta spec (behavior frozen), Scenario→test mapping (traceability), archive merge (main spec stays truthful). Skipped: design doc, human approval, heavy verification suite.
- **`--force` boundary**: relaxes status prerequisite only, not fail-closed. Bad delta format or main spec conflict still BLOCKED.
- **Downgrade audit trail as culture tool**: nobody wants their name on "core domain downgrade audit" frequently. Make the right thing easy, make shortcuts visible — more effective than prohibition.
