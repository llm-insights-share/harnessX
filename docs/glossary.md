# HarnessX Concept Glossary

One-page reference for core terms used across HX, the Hub, and delivery orchestration.

## Layer model (who owns what)

| Layer | Name | Role |
|-------|------|------|
| L1 | AI Coding IDE | Agent runtime (Cursor, Trae, Qoder, …). Consumes guides via adapter output and L1 env contract (`HX_TASK_*`, `HX_FIX_*`). |
| L2 | hx-hub | Shared asset registry (packages, bundles, blueprints). Git-directory or team hub root. |
| L3 | HX orchestration | `hx` CLI — gates, apply loop, context packs, enforcement. |

## Core concepts

### HX (HarnessX)

The outer harness around AI coding agents: spec-driven delivery with **guides** (direction), **sensors** (verification), and **gates** (stage/task transitions). HX does not replace your IDE; it coordinates what the agent sees and what must pass before work advances.

### Harness instance

An initialized project workspace: `harnessX/` containing `harness.yaml` (asset registry), `config.yaml` (project choices), `constitution.md`, and per-change artifacts under `changes/`.

### Change

A unit of delivery work (feature, fix, migration). Each change has `meta.yaml` (stage/task state), delta specs, optional design/tasks, and an isolated asset overlay under `changes/<id>/assets/`.

### Profile

A **workflow profile** in `harness.yaml` (e.g. `standard`, `enterprise`) defining which **stages** run, which **tasks** each stage includes, and which sensor **suites** bind to each task. See [delivery-stages.zh-CN.md](delivery-stages.zh-CN.md) for the authoritative task registry.

### Stage

The four delivery stages: `req` (requirements), `arch` (architecture), `dev` (development), `test` (testing). `req`/`arch` are org-scoped (`docs/`); `dev`/`test` are change-scoped (`harnessX/changes/<id>/`).

### Task

A unit of work within a stage, e.g. `prd-writing` in `req`, `propose`/`design`/`apply` in `dev`. `hx gate check --stage <stage> --task <task>` runs the bound sensor suite at task granularity.

### Suite

A named list of sensor ids (e.g. `fast`, `verification-enterprise`) keyed in `harness.yaml` as `dev.apply`, `test.test-case-design`, etc., and executed together during `hx gate check`.

### Bundle (topology bundle)

A reusable slice of guides/sensors/suites for a topology (e.g. `api-service`). Referenced via `imports:` in `harness.yaml` or installed into `assets/bundles/`.

### Blueprint

A delivery path preset (`blueprint.yaml`): extends a profile, declares `hub_deps`, and maps **stage.task → guides/sensors**. Applying a blueprint wires missing refs into `harness.yaml`.

### Asset

A versioned unit under a directory with `asset.yaml` (manifest): guides, sensors, orch patterns, or hub packages. Lifecycle: draft → trial → enforced → deprecated.

### Asset layer (resolution)

Precedence when the same asset id appears in multiple places:

`change > local > team > hub > builtin`

Undeclared shadowing requires an `overrides:` entry with a reason in `harness.yaml`.

### Tier (adapter)

Capability tier of the L1 IDE (0 / 1 / 2) derived from declared adapter capabilities (commands, skills, hooks, MCP, …). Lower tiers trigger **gate compensation** (extra sensors, warn→block escalation).

## Two “layer” meanings

| Term | Meaning |
|------|---------|
| Org layers L1/L2/L3 | IDE → Hub → Orchestration (above) |
| Asset layers | Resolution stack for a single asset id (change/local/team/hub/builtin) |

## L1 standard contract

Tier-1 agents receive structured handoffs via environment variables (see `schemas/l1/agent-env-contract.json`):

- **Apply**: `HX_TASK_ID`, `HX_TASK_TITLE`, `HX_TASK_PACK`, `HX_FIX_HINTS`, …
- **Fix**: `HX_FIX_PACK`, `HX_FIX_SENSOR`, `HX_FIX_HINTS`

MCP tools `apply_task`, `fix_session`, and `drift_check` expose the same contracts to IDE bridges.

## Package boundaries (extension points)

| Import path | Responsibility |
|-------------|----------------|
| `@harnessx/core` → `orchestration` | Gates, apply, guides, L1 contract, MCP |
| `@harnessx/core` → `hub` | Hub sync, blueprints, imports, asset resolution |
| `@harnessx/adapters` | Compile harness assets to IDE-specific files |

Third-party extensions: custom sensors (`@harnessx/sensors` pattern), hub packages, topology bundles, adapter emitters.
