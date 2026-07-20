# Scenario 12: Customize design output templates before delivery (design/overview.md)
| | |
| --- | --- |
| **Journey** | Customize |
| **Roles** | Architect |
| **Prerequisites** | Scenario(s) 01,11 |
| **Related** | [Scenario picker](00-scenario-picker.md) |

## Background

Coupon-service (scenario 01, `api-service` Bundle) is about to start **bulk coupon issuance**. Architect **Liu** wants design docs to include, beyond the default ADR skeleton:

- **API surface** (public REST + internal events);
- **Data model changes** (tables/indexes);
- **Observability** (metrics, structured log fields, alert thresholds);
- **Rollback plan**.

`hx design` scaffolds `design/overview.md` with Context / ADR / Architecture Constraints. Liu must register a **team design template** in Harness **before** the first design change, so agents produce a consistent structure in `/hx-dev-design`.

> **Current implementation note**: `proposal-template` is rendered directly by `hx propose`. `design-template` is registered as a `guide.template` asset injected into the `dev:design` Context Pack; together with a customized thin `/hx-dev-design` checklist (plus adapter appendix), the agent **expands** the minimal scaffold into the full template layout.

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
stage: dev
task: design
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
    stage: dev
    task: design
    source: assets/guides/design-template/template.md
  # api-service bundle already provides:
  # - id: api-design
  #   stage: dev
  #   task: design  # (or a separate guide with task: apply)
```

### 3. Customize the `/hx-dev-design` task shell (critical)

Edit `harnessX/assets/workflows/dev/design.md` (or register an optional `guide.command` override). Change step 2 to explicitly reference the template:

```markdown
2. Fill `harnessX/changes/<change>/design/overview.md` using the **design-template** guide in this Context Pack:
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
cursor (Tier 1): ... file(s)
  + .cursor/commands/hx-dev-design.md
  + .cursor/skills/...
```

Confirm the template appears in the Context Pack:

```console
$ hx change create bulk-issue --domains coupon-issuing
$ hx propose bulk-issue --title "Bulk coupon issuance"
# … complete proposal and pass gate check …

$ hx guide pack bulk-issue --stage dev --task design | head -40
# Context Pack — design / bulk-issue
# …
# ## Guide: design-template (guide.template)
# … API Surface / Data Model / Observability …
```

### 6. Run the design phase

```text
Cursor ▸ /hx-dev-design bulk-issue
```

The agent:

1. Runs `hx design bulk-issue` (proposal completeness check inside);
2. Reads **design-template** from the Context Pack and expands `design/overview.md` with all sections;
3. Updates delta specs if API design implies new Scenarios, then `hx gate check --stage dev --task propose`;
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
GATE PASS (dev/design)
advanced: dev/propose → dev/design
```

### 7. How downstream phases enforce the template

| Template section | Downstream enforcement |
|------------------|------------------------|
| Architecture Constraints | `arch-boundary`, `perf-budget` sensors at verify |
| API Surface | `/hx-dev-plan` review + endpoint behavior in delta spec; `api-design` Skill at apply |
| ADR Consequences | `/hx-dev-plan` requires a task per consequence |
| Observability / Rollback | Human review + optional custom Sensors (scenario 10) |

There is **no** dedicated `design-validate` sensor like `spec-validate` — structural compliance relies on **guide.template + customized workflow shell + human review**; architecture violations are still caught by Architecture Sensors at apply/verify.

## Key mechanisms

- **Dual customization**: template asset (`guide.template`) defines **shape**; workflow shell (`guide.workflow`, optional `guide.command` override) defines **which sections agents must fill and when to stop**; Skill (`guide.skill`) defines **domain norms** (e.g. RFC 7807 errors). Task-level command/skill projections are shells only.
- **Task-isolated Context Pack**: `dev:design` injects `proposal.md` + `design/overview.md` + design Guides — no apply-task noise (see `guideEngine.ts` artifact selection by stage/task).
- **Pairs with scenario 11**: compliance fields added to the proposal template should be referenced in the design template **Context** section for requirements → design traceability.
- **Permissions**: design-task agents primarily edit `changes/<id>/design/**` and `changes/<id>/specs/**` (when design finalizes delta).

## Common pitfalls

1. **Template only, no `workflows/dev/design.md` edit** — agents may follow the default three-step flow and skip Observability / Rollback. Change workflow and template together.
2. **Hand-editing `.cursor/commands/hx-dev-design.md`** — overwritten on next `adapter sync`; edit `harnessX/assets/workflows/dev/design.md` (or an optional `guide.command` override) only.
3. **Removing ADR / Architecture Constraints from the template** — not immediately Gate-blocked, but `/hx-dev-plan` and verify sensors lose leverage; extend sections rather than delete core ones.
