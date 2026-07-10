# Scenario 04: Two Teams Modify the Same Capability Concurrently
| | |
| --- | --- |
| **Journey** | Daily delivery |
| **Roles** | Multi-team |
| **Prerequisites** | Scenario(s) 01,02 |
| **Related** | [Scenario picker](00-scenario-picker.md) |

## Background

Inventory center (inventory-service) has two parallel requirements this week, both touching `stock-reservation`:

- **Team A (Wu)**: `reservation-ttl` — add TTL to reservations, auto-release on timeout;
- **Team B (Zheng)**: `bulk-reserve` — bulk reservation API.

Both changes develop in parallel and eventually merge deltas into the same `harnessX/specs/stock-reservation/spec.md`. This is the most common conflict shape under high-throughput AI delivery: **concurrent spec-level writes**.

## Steps

### 1. Overlap detected at creation

Wu creates first:

```console
$ hx change create reservation-ttl --domains stock-reservation
Created change "reservation-ttl" (profile: standard, domains: stock-reservation)
```

Zheng creates second; system warns immediately:

```console
$ hx change create bulk-reserve --domains stock-reservation,api-gateway
Created change "bulk-reserve" (profile: standard, domains: stock-reservation, api-gateway)
WARNING: overlaps with active change "reservation-ttl" on domains: stock-reservation
```

This is **warning only, not blocking** — parallelism is normal, but both leads should align now: "which Requirements do you touch, which do I?" Zheng reads Wu's delta; both modify existing `Requirement: Create reservation` (Wu adds TTL semantics, Zheng adds bulk semantics). Agreement: Wu merges first; Zheng rebases on merged result.

### 2. Team A completes and archives normally

Wu's delta (excerpt):

```markdown
## MODIFIED Requirements

### Requirement: Create reservation
WHEN a reservation request is received, THE SYSTEM SHALL create a reservation with TTL (default 900 seconds) and return reservation ID.

#### Scenario: reservation expires after ttl
- GIVEN a reservation with TTL 900 seconds
- WHEN 900 seconds pass without confirmation
- THEN reservation released, inventory restored
```

Full flow → `hx archive reservation-ttl`; main spec "Create reservation" now has TTL semantics.

### 3. Team B rebase check before archive

Zheng's delta was written against **old** main spec `MODIFIED Requirements → Create reservation`. After verify, before archive, run rebase check (archive enforces the same check internally; early run catches issues sooner):

```console
$ hx rebase check bulk-reserve
deltas apply cleanly against current specs
```

This time it looks clean — because MODIFIED is "full replace" semantics, Zheng's version would overwrite Wu's freshly merged text — **that's the danger**: silent overwrite drops TTL semantics. Real conflict appears when Wu **renames** the requirement to "Create reservation and expiry":

```console
$ hx rebase check bulk-reserve
CONFLICT stock-reservation/"Create reservation" (MODIFIED): not found in base spec (concurrent change may have removed/renamed it)
  → Requirement "Create reservation" no longer exists in stock-reservation/spec.md — a concurrent change likely renamed or removed it. Re-read the current spec and rewrite your MODIFIED entry against it.

$ hx archive bulk-reserve
BLOCKED: stock-reservation/"Create reservation" (MODIFIED): not found in base spec (concurrent change may have removed/renamed it). Rebase your delta against current specs/ and retry.
```

### 4. Resolve conflict: rewrite delta against current main spec

Zheng's correct action is not editing the conflict report — **re-read current main spec** (`harnessX/specs/stock-reservation/spec.md`, now with TTL semantics) and rewrite MODIFIED to stack bulk semantics on TTL. Feed the conflict report to Cursor agent:

```text
Cursor ▸ /hx-spec bulk-reserve
         rebase check reported conflict below; rewrite MODIFIED entries against current main spec:
         CONFLICT stock-reservation/"Create reservation" (MODIFIED): not found in base spec ...
```

`/hx-spec` prompt step one is exactly this — "re-read **current** main spec for each capability (another change may have archived since your propose); if MODIFIED/REMOVED targets missing, rewrite against latest text". Agent reads new requirement text with TTL (including Wu's new Scenario), adds bulk semantics, rewrites whole requirement. Zheng confirms merged semantics in diff:

```markdown
## MODIFIED Requirements

### Requirement: Create reservation and expiry
WHEN single or bulk (<=100) reservation requests are received, THE SYSTEM SHALL create a reservation with TTL (default 900 seconds) per item; if any item fails, roll back entire batch.

#### Scenario: reservation expires after ttl
(keep Wu's scenario verbatim)

#### Scenario: bulk reserve is atomic
- GIVEN bulk reservation of 3 items, 1 with insufficient stock
- WHEN submitting bulk request
- THEN return 409, none of the 3 created
```

Note: **MODIFIED must carry the full latest requirement content** (including others' Scenarios) — merge is replace semantics — cost of "rewrite not patch", benefit: merged result always readable, no three-way merge ambiguity.

Re-verify:

```console
$ hx gate check bulk-reserve --stage dev --task propose
GATE PASS (dev/propose)
$ hx rebase check bulk-reserve
deltas apply cleanly against current specs
$ hx archive bulk-reserve
Archived to harnessX/archive/2026-07-08-bulk-reserve
Merged capabilities: stock-reservation, api-gateway
```

Delta content changed — CI `meta verify` finds approval artifact hash mismatch — Zheng must **re-request Zhang's design-to-plan gate approval**. Not bureaucracy: spec substance changed, approval must repeat.

## Key mechanisms

- **Three defense layers**: domain overlap **warning** at creation (human alignment) → rebase **check** before archive (machine backstop) → **block with guidance** on conflict (fail-closed). Light cases: communication; heavy cases: machine.
- **Why no automatic three-way merge?** Specs are human/agent-readable authority; auto-merged "stitched text" nobody truly reviewed. Forcing "rewrite against latest main spec" ensures every main spec version has clear ownership.
- **Approval hash linked to conflict resolution**: rewrite delta ⇒ artifact hash changes ⇒ prior approval void. Mechanism ensures "substantive spec change always returns to human approval point".
