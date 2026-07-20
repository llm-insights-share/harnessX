# HarnessX Concept Glossary

One-page reference for core terms used across HX, the Hub, and delivery orchestration.

## Layer model (who owns what)

| Layer | Name | Role |
|-------|------|------|
| L1 | AI Coding IDE | Agent runtime (Cursor, Trae, Qoder, …). Consumes guides via adapter output and L1 env contract (`HX_TASK_*`, `HX_FIX_*`). |
| L2 | hx-hub | Shared asset registry (`guide.*` / `sensor.*` packages). Git-directory or team hub root. |
| L3 | HX orchestration | `hx` CLI — gates, apply loop, context packs, enforcement. |

## Core concepts

### HX (HarnessX)

The outer harness around AI coding agents: spec-driven delivery with **guides** (direction), **sensors** (verification), and **gates** (stage/task transitions). HX does not replace your IDE; it coordinates what the agent sees and what must pass before work advances.

### Harness instance

An initialized project workspace: `harnessX/` containing `harness.yaml` (asset registry), `config.yaml` (project choices), `constitution.md`, and per-change artifacts under `changes/`.

### Change

A unit of delivery work (feature, fix, migration). Each change has `meta.yaml` (stage/task state), delta specs, optional design/tasks, and an isolated asset overlay under `changes/<id>/assets/`.

### Profile

Workflow tiers: `lite` / `standard` / `strict` / `enterprise`. Defines which **stages** run, which **tasks** each stage includes, and which sensor **suites** bind to each task. See [delivery-stages.zh-CN.md](delivery-stages.zh-CN.md).

Project owners create a project with a profile; hub assets whose `asset.yaml` `stage`/`task` match that profile are pulled into the project GitHub repo.

### Stage

The four delivery stages: `req` (requirements), `arch` (architecture), `dev` (development), `test` (testing). `req`/`arch` are org-scoped (`docs/`); `dev`/`test` are change-scoped (`harnessX/changes/<id>/`).

Local members set `active_stages` in `config.yaml` (one or more; must be a subset of the project profile).

### Task

A unit of work within a stage, e.g. `prd-writing` in `req`, `propose`/`design`/`apply` in `dev`. `hx gate check --stage <stage> --task <task>` runs the bound sensor suite at task granularity.

### Guide (FeedForward)

Rules, templates, skills, constraints, workflows, commands — injected into agent context before work.

- **`guide.skill` / `guide.template`**: domain norms and output shape (the real assets).
- **`guide.workflow`**: task-shell body (Input / Steps / Output) at `assets/workflows/<stage>/<task>.md`.
- **`guide.command` (optional)**: overrides the workflow body for a custom slash-command shell.

### TaskShell

Task-level commands/skills are thin shells: `assembleTaskShell` composes the workflow (or command override) with bound skills/templates, suite sensors, and gate reminders, then projects the same content as a slash command or a task-entry skill depending on IDE capabilities.

### Sensor (FeedBack)

Verification at task/gate boundaries (rule, script, rubric, fixture, budget, drift, …). Failures return `fix_hint`.

### Suite

A named list of sensor ids (e.g. `fast`, `verification`, `verification-sdlc`, `design-basic`). Prefer binding via `profiles.*.tasks[].suite`; optional tasks may use the legacy map `suites: { "req.biz-understanding": "req-biz" }`.

### Asset

A versioned unit with `asset.yaml` (`guide.*` / `sensor.*`). **Bound to a stage.task**. Lifecycle: draft → trial → enforced → deprecated.

### Asset layer (resolution)

Precedence when the same asset id appears in multiple places:

`change > local > team > hub > builtin`

Undeclared shadowing requires an `overrides:` entry with a reason in `harness.yaml`.

### Tier (adapter)

Capability tier of the L1 IDE (0 / 1 / 2) derived from declared adapter capabilities. Lower tiers trigger **gate compensation**.

## Two “layer” meanings

| Term | Meaning |
|------|---------|
| Org layers L1/L2/L3 | IDE → Hub → Orchestration (above) |
| Asset layers | Resolution stack for a single asset id (change/local/team/hub/builtin) |

## L1 standard contract

Tier-1 agents receive structured handoffs via environment variables (see `schemas/l1/agent-env-contract.json`):

- **Apply**: `HX_TASK_ID`, `HX_TASK_TITLE`, `HX_TASK_PACK`, `HX_FIX_HINTS`, …
- **Fix**: `HX_FIX_PACK`, `HX_FIX_SENSOR`, `HX_FIX_HINTS`

## Package boundaries (extension points)

| Import path | Responsibility |
|-------------|----------------|
| `@harnessx/core` → `orchestration` | Gates, apply, guides, L1 contract, MCP |
| `@harnessx/core` → `hub` | Hub sync, profile asset resolution |
| `@harnessx/adapters` | Compile harness assets to IDE-specific files |

See also [architecture/package-boundaries.md](architecture/package-boundaries.md).
