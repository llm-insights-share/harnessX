# HarnessX Operation Guide

**中文**: [操作说明（中文）](operation-guide.zh-CN.md)

This guide explains how to use HarnessX (`hx` CLI) with AI coding agents in day-to-day delivery. **Every command documents all options and their meaning**; **every user-editable configuration file includes samples and setup steps**. For end-to-end walkthroughs, see [`docs/examples/en/`](examples/en/README.md).

---

## 1. Prerequisites

```bash
git clone <your-repo>
cd <your-repo>
npm install
```

Examples use `hx` as shorthand for `node bin/hx.js` (or a globally installed `hx`). View help for any subcommand:

```bash
hx --help
hx gate check --help
```

---

## 2. Initialize a project

### 2.1 `hx init`

Creates the `harnessX/` scaffold in the repository root.

```bash
hx init [options]
```

| Option | Required | Meaning |
| --- | --- | --- |
| `--bundle <id>` | No | Merge a topology bundle at init. Built-ins: `api-service`, `api-service-cn`, `frontend-dashboard`, `library-sdk`, `serverless-function`, `mobile-app`, `data-pipeline`, and `*-cn` variants |
| `--locale <id>` | No | Scaffold locale. `hx-cn` = Chinese assets (constitution, command prompts, templates, fix_hint strings) |
| `--from-hub <id>@<ver>` | No | Install from a Hub package/bundle/blueprint (**requires** `--hub`) |
| `--hub <path>` | With `--from-hub` | Hub repository root (local path or git clone) |
| `--adapter <target>` | No | Default adapter target written to `config.yaml` (`cursor`, `codex`, `trae`, …) |

**Example — English default + API topology:**

```bash
hx init --bundle api-service
```

**Example — Chinese scaffold:**

```bash
hx init --locale hx-cn --bundle api-service-cn
```

**Example — from Hub (v0.3+ recommended):**

```bash
hx hub seed ./harness-hub
hx init --from-hub api-service@1.0.0 --hub ./harness-hub
hx init --from-hub enterprise-delivery@1.0.0 --hub ./harness-hub --adapter cursor
hx init --locale hx-cn --from-hub api-service@1.0.0 --hub ./harness-hub
```

After init, run:

```bash
hx hooks install
hx ci init
hx adapter sync
```

| Follow-up | Purpose |
| --- | --- |
| `hx hooks install` | Install local git hooks (fast apply-phase gate) |
| `hx ci init` | Generate GitHub Actions replay workflow |
| `hx adapter sync` | Compile harnessX assets to `.cursor/` and other IDE dirs |

### 2.2 `hx bundle`

```bash
hx bundle list [--hub <path>]
hx bundle add <bundleId>
```

| Subcommand / option | Meaning |
| --- | --- |
| `list` | List built-in topology bundles |
| `list --hub <path>` | List bundles under Hub `bundles/` (`id@version`) |
| `add <bundleId>` | Merge bundle into `harness.yaml` and copy assets to `assets/bundles/<id>/` |

---

## 3. Configuration reference

HarnessX keeps **project choices** (`config.yaml`) separate from the **asset registry** (`harness.yaml`). Most day-to-day customization touches these two files.

### 3.1 `harnessX/config.yaml`

Workflow selection, Hub path, adapter, and tier compensation.

**Minimal sample:**

```yaml
profile: standard
locale: en
```

**Full sample (Hub, adapter, compensation):**

```yaml
profile: enterprise          # default workflow: lite | standard | strict | enterprise
locale: zh-CN                # en | zh-CN — affects scaffolds and some copy

hub: ./harness-hub           # Hub root; used by hub add/sync/search and imports resolution

adapter:
  target: cursor             # primary IDE target
  tier: 1                    # optional manual override; usually auto-detected by adapter sync

compensation:
  enabled: true              # strengthen gates for Tier 2 adapters
  extra_verify_sensors:
    - typecheck
    - lint
  escalate_warn_to_block: true
```

**Setup steps:**

1. Open `harnessX/config.yaml` after init.
2. Set `profile` to your team default (`lite` for small changes, `standard` for features, `strict`/`enterprise` for compliance).
3. When using a central Hub, set `hub` to the Hub directory (relative or absolute path).
4. Run `hx adapter sync --targets cursor` (or your IDE); tier is written to `.harnessx-adapter-tier`. Edit `compensation` if you need a fixed policy.
5. Chinese teams: set `locale: zh-CN` (pairs with `hx init --locale hx-cn`).

### 3.2 `harnessX/harness.yaml`

Asset registry: profiles, suites, guides, sensors, Hub dependencies, and topology imports.

**Minimal sample (expand topology via imports, v0.5+):**

```yaml
version: "1.0"
constitution: constitution.md

imports:
  - api-service              # merged at read time: guides/sensors/suites from bundle

profiles:
  standard:
    phases: [propose, design, spec, plan, apply, verify, archive]
    suites:
      spec: fast
      apply: fast
      verify: verification

suites: {}
guides: []
sensors: []
dependencies: []
overrides: []
```

**Sample — custom guide + sensor:**

```yaml
guides:
  - id: team-api-style
    kind: guide.skill
    execution: inferential
    phase: [apply]
    source: assets/guides/team-api-style/SKILL.md

sensors:
  - id: secscan
    kind: sensor.script
    execution: computational
    phase: [verify]
    trigger: phase              # phase | file-save | schedule
    builtin: lint                 # or plugin: ./plugins/secscan.mjs
    on_fail: block                # block | warn | retry
    max_retries: 0
    fix_hint: "Fix security scan findings, then re-run hx gate check"
    timeout_ms: 120000

overrides:
  - id: coding-conventions
    source: assets/guides/team-coding/SKILL.md
    reason: "Team standard overrides builtin; approved 2026-03-01"
```

**Field reference:**

| Section | Field | Meaning |
| --- | --- | --- |
| Top | `imports` | Topology bundle refs (`bundle-id` or `bundle-id@1.0.0`); expanded at `readHarness()` without rewriting the file |
| Top | `dependencies` | Hub packages (`pkg@version`), maintained by `hx hub add` |
| Top | `overrides` | Cross-layer shadowing requires a `reason` |
| `profiles.<name>` | `phases` | Phase commands for this profile |
| `profiles.<name>` | `suites` | Phase → suite name map |
| `suites.<name>` | (array) | Sensor id list |
| `guides[]` | `id`, `kind`, `source`, `phase`, `execution` | Guide registration |
| `sensors[]` | `builtin` / `plugin` / `run` | Pick one execution mechanism |

**Setup — add a team skill:**

1. Create `harnessX/assets/guides/<id>/` with `asset.yaml` and `SKILL.md`.
2. Append to `harness.yaml` `guides` (or let blueprint / `hx hub add` wire it).
3. Run `hx lock write` to pin content hashes.
4. Run `hx harness lint` for constitution/skill conflicts.

### 3.3 `harnessX/blueprint.yaml`

Delivery path preset: profile, Hub deps, phase → asset mapping.

**Sample:**

```yaml
name: standard-delivery
extends: standard
hub_deps:
  - prd-writing@1.0.0
  - prototype-wireframe@1.0.0
phases:
  propose:
    guides: [prd-writing]            # auto-resolved into harness.yaml if missing
  design:
    guides: [prototype-wireframe]
  verify:
    sensors: [drift, uat-complete]
```

**Setup:** Edit `blueprint.yaml`, then install via Hub (scenario [16](examples/en/16-v0.3-hub-blueprint-init.md)) or `hx init --from-hub <blueprint>@<ver> --hub <path>`.

### 3.4 `harnessX/constitution.md`

Highest-priority project principles (domains, non-negotiables). Always included in Context Packs.

**Setup:** Edit immediately after init; run `hx harness lint` to catch skill contradictions.

### 3.5 `harnessX/harness.lock`

Generated by `hx lock write`; pins resolved asset versions and content hashes. Commit to git; CI uses `hx lock verify`.

---

## 4. Two operation entry points

| Entry | Use for | Examples |
| --- | --- | --- |
| **Terminal** | Human approval, gate advance, waivers, archive | `hx gate approve`, `hx gate advance` |
| **Cursor dialog** | Agent drafts proposals, specs, code, self-correction | `/hx-propose`, `/hx-apply` |

Rule of thumb: **let the agent do what it can in Cursor; reserve the terminal for human-only actions**.

Run `hx adapter sync` before slash commands. Type `/` to see `hx-explore` … `hx-archive`.

---

## 5. Standard delivery loop

Using the `standard` profile:

```
explore → propose → design → spec → [human approval] → plan → apply → verify → archive
```

### 5.1 Create change — `hx change create`

```bash
hx change create <id> [options]
```

| Option | Required | Meaning |
| --- | --- | --- |
| `--domains <list>` | Yes* | Comma-separated touched domains (e.g. `orders,payments`) |
| `--profile <name>` | No | Override default profile |
| `--from-issue <url>` | No | Scaffold from GitHub issue URL (domains from labels) |

\* Omit `--domains` when using `--from-issue`.

```bash
hx change create add-refund --domains orders,payments
hx change list
```

### 5.2 Propose — `hx propose` / `/hx-propose`

```bash
hx propose <change> [--title <title>]
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--title` | `Untitled` | Title written to `proposal.md` |

```bash
hx gate check add-refund --phase spec
```

### 5.3 Design — `hx design`

```bash
hx design <change>    # no extra flags; runs design gate then scaffolds design
hx gate advance add-refund
```

### 5.4 Spec — human approval

```bash
hx gate approve <change> --gate <gate> --approver <name>
hx gate advance <change>
```

| `gate approve` option | Required | Meaning |
| --- | --- | --- |
| `--gate` | Yes | Gate name, usually `spec` |
| `--approver` | Yes | Approver name (audit trail) |

### 5.5 Plan — `hx plan`

```bash
hx plan <change>    # generates dual-track tasks.md; no options
```

### 5.6 Apply — `hx apply`

```bash
hx apply <change> [options]
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--runner <cmd>` | — | Shell command per task; sets `HX_TASK_*`, `HX_FIX_HINTS`, `HX_TASK_PACK` |
| `--max-retries <n>` | `3` | Self-correction rounds after fast suite failure |
| `--limit <n>` | — | Stop after N tasks |
| `--parallel <n>` | `1` | Max concurrent tasks in the same `@group=` |
| `--fan-out <n>` | — | Run apply+verify in N isolated worktrees; pick best |

```bash
hx apply add-refund --runner 'cursor-agent --task "$HX_TASK_TITLE"'
hx apply add-refund --parallel 2 --runner '<agent>'
hx apply add-refund --fan-out 3 --runner '<agent>'
```

Weak IDEs (Codex/OpenCode): `hx adapter sync --targets codex,generic` → Tier 2 strengthens gates.

### 5.7 Verify — `hx verify` / `hx fix`

```bash
hx verify <change>
hx fix --change <change> --sensor <sensorId> [--runner <cmd>]
```

| `fix` option | Required | Meaning |
| --- | --- | --- |
| `--change` | Yes | Change id |
| `--sensor` | Yes | Failing sensor id |
| `--runner` | No | Launch fix session with `HX_FIX_PACK` env |

### 5.8 Archive — `hx archive` / `hx rebase check`

```bash
hx rebase check <change>
hx archive <change> [--force]
```

| Option | Meaning |
| --- | --- |
| `--force` | Skip verified-state requirement (lite profile, etc.) |

---

## 6. Full command reference

Grouped by family; only documented options are listed.

### 6.1 Gates and guides — `hx gate` / `hx guide`

| Command | Options | Meaning |
| --- | --- | --- |
| `gate check <change>` | `--phase <cmd>` | Check a phase; default = next phase to advance |
| `gate advance <change>` | — | Advance when sensors pass + preconditions met |
| `gate approve <change>` | `--gate`, `--approver` (required) | Record human approval |
| `gate hook-check` | — | Git hook: apply gate for implementing changes |
| `gate replay` | — | CI: replay next-phase gate for all active changes |
| `guide pack <change>` | `--phase` (required), `--out <file>` | Assemble phase Context Pack |
| `guide task-pack <change> <taskId>` | `--out <file>` | Single-task pack (default `tasks/<id>-pack.md`) |

### 6.2 Explore and archive

| Command | Options | Meaning |
| --- | --- | --- |
| `explore <change>` | `--topic <topic>` | Read-only exploration topic (default `unscoped`) |
| `archive <change>` | `--force` | Merge deltas and archive |
| `openspec import` | `--from <dir>` | OpenSpec directory (default `openspec`) |

### 6.3 Verification and waivers

| Command | Options | Meaning |
| --- | --- | --- |
| `verify <change>` | — | Full verification suite + traceability |
| `trace check [change]` | `--all` | Scenario→test coverage |
| `sync` | — | Spec↔code drift detection |
| `view` | `--out <file>` | HTML dashboard (default `harnessx-dashboard.html`) |
| `status` | — | Active changes table |
| `waiver add <change>` | `--target`, `--reason`, `--requested-by`, `--approved-by` (required), `--expires <iso>` | Time-boxed waiver; `target` = sensor id, `scenario:…`, `tests:…` |
| `waiver list <change>` | — | List waivers and expiry |
| `harness lint` | — | Constitution vs skill conflicts |
| `rebase check <change>` | — | Delta conflict pre-flight |
| `profile recommend <change>` | `--diff-lines <n>`, `--choose <profile>`, `--override-reason <reason>` | Recommend/record profile |

**Waiver example:**

```bash
hx waiver add add-refund \
  --target lint \
  --reason "Third-party SDK false positive, manually verified" \
  --requested-by alice \
  --approved-by bob \
  --expires 2026-04-01T00:00:00Z
```

### 6.4 Test-first and fixtures

| Command | Options | Meaning |
| --- | --- | --- |
| `testfirst generate <change>` | — | Generate test stubs (strict profiles) |
| `testfirst approve <change>` | `--files <list>`, `--by <name>` | Hash-lock approved test files |
| `fixture approve <file>` | `--by <name>` | Approve fixture snapshot |
| `fixture verify` | — | Verify approved fixtures intact |

### 6.5 Assets and Hub

| Command | Options | Meaning |
| --- | --- | --- |
| `asset list` | `--change <id>` | Layer-resolved asset list |
| `asset promote <dir>` | `--to trial\|enforced\|deprecated` | Lifecycle promotion |
| `asset backfill <dir>` | — | Backfill metrics from runs |
| `asset scan <dir>` | — | Guide injection scan |
| `lock write` / `lock verify` | — | Write/verify `harness.lock` |
| `hub golden` | — | List built-in golden Hub packages |
| `hub seed [path]` | — | Create Hub dir (default `harness-hub`) |
| `hub add <id>@<ver>` | `--hub <path>` (required) | Install to `.hub-cache/` |
| `hub sync` | `--hub` (required), `--apply`, `--force`, `--only <ids>` | Report/three-way-merge upstream |
| `hub promote <dir>` | `--hub`, `--by` (required), `--evidence <ref>` | Publish local asset to Hub |
| `hub approve <id>@<ver>` | `--hub`, `--reviewer` (required) | Approve Hub package review |
| `hub eval <id>@<ver>` | `--hub` (required), `--local <dir>`, `--golden <name>` | Pre-publish validation |
| `hub search [q]` | `--hub` (required), `--kind`, `--phase`, `--category package\|bundle\|blueprint`, `--index` | Search Hub catalog |
| `bundle list` | `--hub <path>` | List built-in or Hub bundles |

**Hub setup workflow:**

```bash
# Platform team
hx hub seed ./harness-hub
cd harness-hub && git init && git add . && git commit -m "seed hub"

# Application repo config.yaml:
# hub: ../harness-hub

hx hub add prd-writing@1.0.0 --hub ./harness-hub
hx hub sync --hub ./harness-hub
hx hub sync --hub ./harness-hub --apply
hx lock write
```

### 6.6 Adapters

| Command | Options | Meaning |
| --- | --- | --- |
| `adapter sync` | `--targets <list>` | Compile targets (default `cursor,trae,qoder,claude,generic`) |
| `adapter targets` | — | List targets with Tier/capabilities |
| `adapter drift` | `--targets <list>` | Detect hand-edited IDE output |
| `adapter quest <change>` | — | Export Qoder Quest spec |

### 6.7 Orchestration and review (v0.2+)

| Command | Options | Meaning |
| --- | --- | --- |
| `runtime worktree <action> [change]` | `--slot`, `--path` | `create` / `list` / `remove` isolated worktree |
| `review import <change> <file>` | — | Import diff line annotations JSON/YAML |
| `review list <change>` | — | List review annotations |
| `review resolve <change> <id>` | — | Mark annotation resolved |
| `eval guides <change>` | `--cases <file>` | Guide behavior evals |
| `notify <change>` | `--interval <ms>`, `--webhook <url>`, `--once` | Poll change state; or `HX_WATCH_WEBHOOK` |

### 6.8 Steering and rubric

| Command | Options | Meaning |
| --- | --- | --- |
| `steer report` | `--threshold <n>` | Failure pattern threshold (default `3`) |
| `steer distill <signature>` | `--kind guide.skill\|sensor.rubric` | Distill draft asset from failures |
| `steer harvest-pr` | `--from <file>` | Harvest rubric rules from PR comment JSON |
| `steer coverage` | `--aggregate <dir>` | Per-repo or cross-repo coverage |
| `steer publish <dir>` | `--hub`, `--by` (required), `--evidence`, `--skip-eval` | Metrics→eval→Hub loop |
| `rubric add <text>` | `--pattern <regex>`, `--severity block\|warn\|info` | Add AI review rule |
| `rubric feedback <file> <ruleId>` | `--false-positive` | Record false-positive feedback |
| `janitor run` | — | Expired waivers, drift, dead assets |

### 6.9 Triggers and MCP

| Command | Options | Meaning |
| --- | --- | --- |
| `watch` | — | Foreground daemon for `trigger: file-save` sensors |
| `schedule run` | — | Run `trigger: schedule` sensors (CI cron) |
| `mcp` | — | Stdio MCP: `gate_check`, `guide_pack`, `change_status`, `trace_check`, `apply_task`, `fix_session`, `drift_check` |

### 6.10 Meta integrity

| Command | Options | Meaning |
| --- | --- | --- |
| `meta verify [change]` | `--all` | Verify `meta.yaml` not tampered |

---

## 7. Core mental model

1. Behaviour changes live in a **change workspace** (`harnessX/changes/<id>/`), described by delta specs.
2. **Gates**: `hx gate advance` only when sensors pass and preconditions hold; sensor crashes block (fail-closed).
3. Agent input from **Guides/Context Packs**; output checked by **Sensors**; failures include `fix_hint` for the `hx fix` loop.
4. `hx archive` merges deltas into main specs.
5. Recurring failures feed **Steering** → new guides, shared via **Hub**.

## 8. v0.3 / v0.4 / v0.5 layered architecture

| Layer | Capability | Typical config / commands |
| --- | --- | --- |
| **Hub assets** | Packages/bundles/blueprints, search, eval, sync merge | `init --from-hub`, `hub search`, `imports:` |
| **HX orchestration** | Blueprint closure, tier compensation, drift/UAT | `blueprint.yaml`, `drift` sensor |
| **IDE execution** | Adapters + L1 contract | `adapter sync`, `HX_TASK_*`, `hx mcp` |

Enterprise profile adds `prototype-complete`, `uat-complete`, unified `drift`. See [glossary](glossary.md).

## 9. Further reading

- [17 usage scenario walkthroughs](examples/en/README.md)
- [Concept glossary](glossary.md)
- [Package boundaries](architecture/package-boundaries.md)
- [L1 env contract JSON Schema](../schemas/l1/agent-env-contract.json)
- [System design document](harness-delivery-system-design.html)
- Repository [README.md](../README.md)
