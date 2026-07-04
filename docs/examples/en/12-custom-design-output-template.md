# Scenario 12: Customize design output templates before delivery (design.md)

## Background

Coupon-service (scenario 01, `api-service` Bundle) is about to start **bulk coupon issuance**. Architect **Liu** wants design docs to include, beyond the default ADR skeleton:

- **API surface** (public REST + internal events);
- **Data model changes** (tables/indexes);
- **Observability** (metrics, structured log fields, alert thresholds);
- **Rollback plan**.

`hx design` scaffolds only Context / ADR / Architecture Constraints. Liu must register a **team design template** in Harness **before** the first design change, so agents produce a consistent structure in `/hx-design`.

> **Current implementation note**: `proposal-template` is rendered directly by `hx propose`. `design-template` is registered as a `guide.template` asset injected into the design-phase Context Pack; together with a customized `/hx-design` command prompt, the agent **expands** the minimal scaffold into the full template layout. A future version may render `design-template` directly in `hx design`, mirroring proposal behavior.

## Steps

### 1. Add a design template asset

```console
$ mkdir -p harnessX/assets/guides/design-template/examples
```

Create `harnessX/assets/guides/design-template/template.md`:

```markdown
# Design: {{change}}

## Context

<!-- Constraints from proposal.md, explore.md, existing specs; link related ADRs/specs -->

## API Surface

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| | | | |

## Data Model

<!-- New tables/columns/indexes; migration strategy -->

## Decisions (ADR)

### ADR-1: <title>
- Status: proposed
- Decision:
- Alternatives considered:
- Consequences:

## Architecture Constraints

<!-- Must be mechanically checkable by arch-boundary / perf-budget sensors -->

- Layering: routes → services → repositories (no reverse imports)
- ...

## Observability

- Metrics:
- Log fields (structured):
- Alerts:

## Rollback Plan

<!-- Feature flags, migration revert, data repair steps -->
```

Optionally add `examples/bulk-issue-coupon-design.md` as a sanitized gold-standard design.

Create `asset.yaml` (same shape as other guide assets):

```yaml
id: design-template
kind: guide.template
category: architecture
phase: [design]
version: 1.0.0
origin: local
status: enforced
execution: computational
provenance: []
metrics: {}
```

### 2. Register in harness.yaml

Append to `guides:` (keep existing `api-design` Skill from the Bundle if present):

```yaml
guides:
  - id: design-template
    kind: guide.template
    execution: computational
    phase: [design]
    source: assets/guides/design-template/template.md
  # api-service bundle already provides:
  # - id: api-design
  #   phase: [design, apply]
```

### 3. Customize the `/hx-design` phase command (critical)

Edit `harnessX/assets/commands/design.md`. Change step 2 to explicitly reference the template:

```markdown
2. Fill `harnessX/changes/<change>/design.md` using the **design-template** guide in this Context Pack:
   - Replace the minimal scaffold from `hx design` with the full section layout from the template (`API Surface`, `Data Model`, `Observability`, `Rollback Plan`, …).
   - **Context** — constraints from explore.md, proposal.md, and current specs;
   - **Decisions (ADR)** — one entry per significant decision; record rejected alternatives and WHY;
   - **Architecture Constraints** — rules arch-boundary / perf-budget sensors can enforce mechanically;
   - **API Surface / Data Model / Observability / Rollback Plan** — required for coupon-service; empty tables are not done.
```

Optional Guardrails:

```markdown
- Every new REST endpoint in API Surface MUST appear in the delta spec (including error responses — see skill:api-design).
- Rollback Plan MUST mention a feature flag or migration revert path when schema changes.
```

### 4. Optional: strengthen api-design Skill

Edit `harnessX/assets/bundles/api-service/skills/api-design.md` (or add a `coupon-design` Skill scoped to design only) with bulk-issuance API conventions aligned to the **API Surface** table columns.

### 5. Lint and compile

```console
$ hx harness lint
no conflicting guide directives found

$ hx adapter sync
cursor (Tier 1): 14 file(s)
  + .cursor/commands/hx-design.md
  + .cursor/skills/...
```

Confirm the template appears in the Context Pack:

```console
$ hx change create bulk-issue --domains coupon-issuing
$ hx propose bulk-issue --title "Bulk coupon issuance"
# … complete proposal and pass gate check …

$ hx guide pack bulk-issue --phase design | head -40
# Context Pack — design / bulk-issue
# …
# ## Guide: design-template (guide.template)
# … API Surface / Data Model / Observability …
```

### 6. Run the design phase

```text
Cursor ▸ /hx-design bulk-issue
```

The agent:

1. Runs `hx design bulk-issue` (proposal completeness check inside);
2. Reads **design-template** from the Context Pack and expands `design.md` with all sections;
3. Updates delta specs if API design implies new Scenarios, then `hx gate check --phase spec`;
4. `hx gate advance bulk-issue` → `designed`.

Excerpt Liu reviews:

```markdown
## API Surface

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | /v1/coupons/bulk-issue | Create bulk issuance job | Bearer |

## Observability

- Metrics: `coupon_bulk_issue_jobs_total{status}`
- Alerts: failure rate > 5% for 10m → P2

## Rollback Plan

- Feature flag `bulk_issue_enabled` defaults false; disable to stop writes.
- Migration `20260401_bulk_jobs` reversible: down script drops `bulk_issue_jobs` table.
```

Terminal advancement:

```console
$ hx gate advance bulk-issue
GATE PASS (design)
advanced: proposed → designed
```

### 7. How downstream phases enforce the template

| Template section | Downstream enforcement |
|------------------|------------------------|
| Architecture Constraints | `arch-boundary`, `perf-budget` sensors at verify |
| API Surface | `/hx-plan` review + endpoint behavior in delta spec; `api-design` Skill at apply |
| ADR Consequences | `/hx-plan` requires a task per consequence |
| Observability / Rollback | Human review + optional custom Sensors (scenario 10) |

There is **no** dedicated `design-validate` sensor like `spec-validate` — structural compliance relies on **guide.template + customized command + human review**; architecture violations are still caught by Architecture Sensors at apply/verify.

## Key mechanisms

- **Dual customization**: template asset (`guide.template`) defines **shape**; command asset (`guide.command`) defines **which sections agents must fill and when to stop**; Skill (`guide.skill`) defines **domain norms** (e.g. RFC 7807 errors).
- **Phase-isolated Context Pack**: design phase injects `proposal.md` + `design.md` + design Guides — no apply-phase noise (see `PHASE_ARTIFACTS` in `guideEngine.ts`).
- **Pairs with scenario 11**: compliance fields added to the proposal template should be referenced in the design template **Context** section for requirements → design traceability.
- **Permissions**: design-phase agents may edit only `changes/<id>/design.md` and `changes/<id>/specs/**` (when design drives spec changes).

## Common pitfalls

1. **Template only, no `commands/design.md` edit** — agents may follow the default three-step flow and skip Observability / Rollback. Change command and template together.
2. **Hand-editing `.cursor/commands/hx-design.md`** — overwritten on next `adapter sync`; edit `harnessX/assets/commands/design.md` only.
3. **Removing ADR / Architecture Constraints from the template** — not immediately Gate-blocked, but `/hx-plan` and verify sensors lose leverage; extend sections rather than delete core ones.
