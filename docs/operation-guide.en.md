# HarnessX Operation Guide

**中文**: [操作说明（中文）](operation-guide.zh-CN.md)

This guide explains how to use HarnessX (`hx` CLI) with AI coding agents in day-to-day delivery. **Every command documents all options and their meaning**; **every user-editable configuration file includes samples and setup steps**.

- **Thematic overview** (concepts, pre-init config, special projects): [`usage-guide.en.md`](usage-guide.en.md)
- **End-to-end scenarios**: [`docs/examples/en/`](examples/en/README.md) ([scenario picker](examples/en/00-scenario-picker.md))

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
| `--hub <path>` | With `--from-hub` | Hub source: local directory or GitHub repo URL (private repos supported; SSH recommended: `git@github.com:<org>/<repo>.git`) |
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

hub: ./harness-hub           # local hub root; can also be GitHub URL (e.g. git@github.com:org/hx-hub.git)

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

**Minimal sample (expand topology via imports, v0.6):**

```yaml
version: "1.0"
constitution: constitution.md

imports:
  - api-service              # merged at read time: guides/sensors/suites from bundle

profiles:
  standard:
    stages: [req, arch, dev, test]
    dev_tasks: [plan, propose, design, apply, verify, archive]
    suites:
      dev.propose: fast
      dev.apply: fast
      dev.verify: verification

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
    stage: dev
    task: apply
    source: assets/guides/team-api-style/SKILL.md

sensors:
  - id: secscan
    kind: sensor.script
    execution: computational
    stage: dev
    task: verify
    trigger: task              # task | file-save | schedule
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
| `profiles.<name>` | `stages` | Delivery stages for this profile (`req`/`arch`/`dev`/`test`) |
| `profiles.<name>` | `dev_tasks` / `test_tasks` | Change-level dev/test task sequences |
| `profiles.<name>` | `suites` | `stage.task` → suite name map (e.g. `dev.apply: fast`) |
| `suites.<name>` | (array) | Sensor id list |
| `guides[]` | `id`, `kind`, `source`, `stage`, `task`, `execution` | Guide registration |
| `sensors[]` | `builtin` / `plugin` / `run` | Pick one execution mechanism |

**Setup — add a team skill:**

1. Create `harnessX/assets/guides/<id>/` with `asset.yaml` and `SKILL.md`.
2. Append to `harness.yaml` `guides` (or let blueprint / `hx hub add` wire it).
3. Run `hx lock write` to pin content hashes.
4. Run `hx harness lint` for constitution/skill conflicts.

### 3.3 `harnessX/blueprint.yaml`

Delivery path preset: profile, Hub deps, stage/task → asset mapping.

**Sample:**

```yaml
name: standard-delivery
extends: standard
hub_deps:
  - prd-writing@1.0.0
  - prototype-wireframe@1.0.0
stages:
  dev.propose:
    guides: [prd-writing]            # auto-resolved into harness.yaml if missing
  dev.design:
    guides: [prototype-wireframe]
  dev.verify:
    sensors: [drift, uat-complete]
```

**Setup:** Edit `blueprint.yaml`, then install via Hub (scenario [16](examples/en/16-v0.3-hub-blueprint-init.md)) or `hx init --from-hub <blueprint>@<ver> --hub <path-or-git-url>`.

### 3.4 `harnessX/constitution.md`

Highest-priority project principles (domains, non-negotiables). Always included in Context Packs.

**Setup:** Edit immediately after init; run `hx harness lint` to catch skill contradictions.

### 3.5 `harnessX/harness.lock`

Generated by `hx lock write`; pins resolved asset versions and content hashes. Commit to git; CI uses `hx lock verify`.

---

## 4. Requirements stage (req)

> Authoritative definition: [delivery-stages.zh-CN.md](delivery-stages.zh-CN.md). `req` is **org-scoped**; artifacts live under `docs/prd/`.

### 4.1 Outputs

| Artifact | Path | Notes |
| --- | --- | --- |
| PRD | `docs/prd/<slug>.md` | Org requirements source of truth |
| Prototype (optional) | PRD sections or attachments | `prototype-wireframe` guide |
| Approvals | `docs/.stage-approvals.yaml` | Written by `hx gate approve --gate prd` |

### 4.2 Recommended flow

```bash
hx req prd init member-badge --title "Member badge"
# Cursor: /hx-prd with prd-writing Skill → docs/prd/member-badge.md
hx req prd check member-badge
hx gate approve --gate prd --prd member-badge --approver chen.pm
hx req status
```

Optional (enterprise-sdlc): `hx req prd submit member-badge --by chen.pm`

### 4.3 Commands and all options

| Command | Options | Meaning |
| --- | --- | --- |
| `req status` | — | List req stage tasks and completion |
| `req prd init <slug>` | `--title <title>` | Scaffold `docs/prd/<slug>.md` |
| `req prd check <slug>` | — | Run `prd-complete` sensor |
| `req prd list` | — | List PRD slugs |
| `req prd submit <slug>` | `--by <name>`, `--title <title>` | Submit PRD review work order |
| `gate approve` | `--gate prd`, `--approver <name>`, `--prd <slug>` | Human PRD sign-off |
| `approve prd <slug>` | `--approver <name>` | PRD approval shorthand |
| `guide prd-pack <slug>` | `--out <file>` | PRD Context Pack |

Cursor slash commands: `/hx-prd` (after `hx adapter sync`).

### 4.4 Gates and sensors

| Task | Typical sensors | Notes |
| --- | --- | --- |
| `requirements-analysis` | `requirements-complete` | Analysis sections complete |
| `prototype-design` | (guide) | Wireframe prototype |
| `prd-writing` | `prd-complete`, `prd-approved` | Format + human approval |

`lite` profile skips req/arch gates and starts at `dev`.

---

## 5. Architecture stage (arch)

> `arch` is **org-scoped**; artifacts live under `docs/architecture/`.

### 5.1 Outputs

| Artifact | Path | Notes |
| --- | --- | --- |
| Global HLD | `docs/architecture/overview.md` | Subsystems, tech choices, external APIs |
| Module registry | `docs/architecture/registry.yaml` | Module ids, capabilities, LLD paths |
| Module LLD | `docs/architecture/modules/<module>/lld.md` | Internal interfaces, ADRs |
| Approvals | `docs/.stage-approvals.yaml` | `hx gate approve --gate arch` / `arch-lld` |

### 5.2 Recommended flow

```bash
hx arch init --title "Member commerce"
# Cursor: /hx-arch → overview.md
hx arch check
hx gate approve --gate arch --approver lin.arch
hx arch lld init member --title "Member module"
hx arch lld check member
hx gate approve --gate arch-lld --module member --approver lin.arch
hx stage status --stage arch
```

### 5.3 Commands and all options

| Command | Options | Meaning |
| --- | --- | --- |
| `arch init` | `--title <title>` | Scaffold global HLD + `registry.yaml` |
| `arch check` | — | Run `arch-check` suite |
| `arch lld init <module>` | `--title <title>` | Scaffold module LLD |
| `arch lld check <module>` | — | Validate module LLD |
| `arch submit` | `--by <name>`, `--change <id>` | Submit architecture review work order |
| `gate approve` | `--gate arch` / `arch-lld`, `--approver <name>`, `--module <id>` | HLD / module LLD sign-off |
| `approve arch` | `--approver <name>` | Global HLD shorthand |
| `approve arch-lld <module>` | `--approver <name>` | Module LLD shorthand |
| `guide arch-pack` | `--out <file>` | Architecture Context Pack |

Cursor: `/hx-arch`, `/hx-arch-lld`.

### 5.4 Gates and sensors

| Task | Typical sensors | Notes |
| --- | --- | --- |
| `subsystem-division` | `arch-hld-complete` | HLD structure complete |
| `internal-interface` | `arch-lld-complete`, `arch-lld-approved` | Module LLD complete and approved |

Before archive, `hx arch promote <change>` writes change-level design back into module LLD (enterprise).

---

## 6. Development stage (dev)

> `dev` is **change-scoped**. Standard task sequence: `plan → propose → design → apply → verify → archive`.

### 6.1 Outputs

| Artifact | Path |
| --- | --- |
| Proposal + delta specs | `changes/<id>/proposal.md`, `specs/**` |
| Design package | `changes/<id>/design/` |
| Task list | `changes/<id>/tasks.md` |
| State + gate history | `changes/<id>/meta.yaml` |
| (enterprise) Requirements analysis | `changes/<id>/requirements/` |

Org `docs/prd/` and `docs/architecture/` are **auto-injected** into Context Packs at `dev.propose` / `dev.design` when `--prd` / `--arch-modules` are set.

### 6.2 Recommended flow

**standard**:

```bash
hx change create add-refund --domains orders,payments
hx propose add-refund --title "Support partial refunds"
hx gate check add-refund --stage dev --task propose
hx design add-refund
hx guide pack add-refund --stage dev --task design --out /tmp/design-pack.md
hx gate check add-refund --stage dev --task design
hx gate approve add-refund --gate design-to-plan --approver alice
hx plan add-refund
hx apply add-refund --runner "<agent-cmd>"
hx gate check add-refund --stage dev --task verify
hx arch promote add-refund --by architect    # enterprise
hx archive add-refund
hx gate advance add-refund
```

**enterprise** (complete req/arch first — [Scenario 19](examples/en/19-org-prd-and-architecture.md)):

```bash
hx change create add-refund --domains orders --profile enterprise \
  --prd orders-refund --arch-modules order
hx propose add-refund --title "Support partial refunds"
hx gate check add-refund --stage dev --task propose
```

### 6.3 Commands and all options

| Command | Options | Meaning |
| --- | --- | --- |
| `change create <id>` | `--domains <list>` | Touched domains |
|  | `--profile <name>` | Override default profile |
|  | `--prd <slug>` | Link org PRD |
|  | `--arch-modules <list>` | Link org module LLD |
|  | `--from-issue <url>` | Scaffold from GitHub issue |
| `change list` | — | Active changes (`stage/task`) |
| `dev status <change>` | — | Dev task progress |
| `propose <change>` | `--title <title>` | Proposal + initial delta spec |
| `design <change>` | — | Design scaffold |
| `plan <change>` | — | Generate tasks from delta spec |
| `apply <change>` | `--runner <cmd>` | Per-task execution (`HX_TASK_*`, `HX_FIX_HINTS`, `HX_TASK_PACK`) |
|  | `--max-retries <n>` | Self-correction retries (default `3`) |
|  | `--limit <n>` | Stop after N tasks |
|  | `--parallel <n>` | Concurrent tasks in same group |
|  | `--fan-out <n>` | Best-of-N worktree execution |
| `gate check <change>` | `--stage dev`, `--task <id>` | Dev task gate (`propose`/`design`/`plan`/`apply`/`verify`/`archive`) |
| `gate approve <change>` | `--gate design-to-plan`, `--approver <name>` | **design→plan** human approval |
| `gate advance <change>` | — | Advance to next task/stage when gate passes |
| `guide pack <change>` | `--stage dev`, `--task <id>`, `--out <file>` | Context Pack |
| `guide task-pack <change> <taskId>` | `--out <file>` | Scoped task handoff pack |
| `fix` | `--change <id>`, `--sensor <id>`, `--runner <cmd>` | Fix session with `fix_hint` |
| `arch promote <change>` | `--by <name>`, `--dry-run` | Change design → module LLD |

### 6.4 Stage-specific configuration

- Suite keys use `dev.<task>` format, e.g. `dev.verify: verification`.
- `design-to-plan` approval is recorded in `meta.yaml`; re-approve after design edits.
- Enable `compensation` for Tier 2 adapters (see §3.1).

---

## 7. Testing stage (test)

> `test` is **change-scoped**. Produces test cases and test reports. `enterprise-sdlc` runs `test-case-design` and `test-execution` tasks.

### 7.1 Outputs

| Artifact | Path |
| --- | --- |
| Test cases | `changes/<id>/test-cases/` |
| Test reports / UAT | sensor reports, `runs/` |
| Traceability | `changes/<id>/traces/traceability.yaml` |

### 7.2 Recommended flow

```bash
hx test status add-refund
hx test-cases init add-refund
hx gate check add-refund --stage test --task test-case-design
hx gate approve add-refund --gate test-cases --approver qa.lead
hx bug create add-refund --title "Refund amount display bug" ...
hx gate check add-refund --stage test --task test-execution
hx trace check add-refund
hx fixture verify
hx meta verify add-refund
```

### 7.3 Commands and all options

| Command | Options | Meaning |
| --- | --- | --- |
| `test status <change>` | — | Test task progress |
| `test-cases init/check/submit <change>` | `--by <name>` (submit) | Test case design workflow |
| `gate check <change>` | `--stage test`, `--task <id>` | `test-case-design` / `test-execution` |
| `gate approve <change>` | `--gate test-cases`, `--approver <name>` | Test case sign-off |
| `bug create/list/fix/close` | — | Bug loop (enterprise-sdlc) |
| `trace check [change]` | `--all` | Scenario→test coverage |
| `fixture approve/verify` | `--by <name>` (approve) | Fixture baselines |
| `waiver add/list <change>` | see §7 in zh guide | Time-bounded waivers |
| `rebase check <change>` | — | Pre-archive conflict check |
| `meta verify [change]` | `--all` | Tamper detection |

### 7.4 Configuration sample

```yaml
profiles:
  enterprise-sdlc:
    stages: [req, arch, dev, test]
    test_tasks: [test-case-design, test-execution]
    suites:
      test.test-case-design: test-design-sdlc
      test.test-execution: verification-sdlc
```

CI:

```bash
hx gate replay
hx trace check --all
hx fixture verify
hx meta verify --all
```

### 7.5 Enterprise SDLC work orders (`enterprise-sdlc`)

| Command group | Purpose |
| --- | --- |
| `hx wo *` | Work orders |
| `hx cr *` | Change requests |
| `hx test-cases *` | Test case design |
| `hx bug *` | Bug loop |

Walkthrough: [Scenario 20](examples/en/20-enterprise-sdlc-workorder-flow.md).

### 7.6 Two entry points

| Entry | Use for | Examples |
| --- | --- | --- |
| **Terminal** | approvals, gate transitions, archive | `hx gate approve`, `hx archive` |
| **Cursor** | draft PRD, specs, code | `/hx-prd`, `/hx-propose`, `/hx-apply` |

Rule of thumb: **agent work in Cursor; human accountability in terminal**.

---

## 8. Cross-Stage Platform Capabilities (optional)

### 8.1 Hub asset management commands

Use these commands when you run a shared Hub with lifecycle/review/policy/integrity controls.

#### `hx hub sync`

```bash
hx hub sync --hub <path-or-git-url> [--apply] [--force] [--only <ids>] [--offline] [--refresh]
```

| Option | Required | Meaning |
| --- | --- | --- |
| `--hub <path>` | Yes | Hub source (local path or GitHub URL) |
| `--apply` | No | Apply upstream changes into local `.hub-cache` |
| `--force` | No | Keep applying when merge conflicts occur (writes conflict markers) |
| `--only <ids>` | No | Comma-separated package ids to sync |
| `--offline` | No | Do not fetch remote; use local mirror cache only |
| `--refresh` | No | Force refresh remote mirror before sync |

#### `hx hub promote`

```bash
hx hub promote <dir> --hub <path-or-git-url> --by <name> [--evidence <ref>] [--skip-policy]
```

| Option | Required | Meaning |
| --- | --- | --- |
| `--hub <path>` | Yes | Hub source (local path or GitHub URL) |
| `--by <name>` | Yes | Publisher identity (recorded in review metadata) |
| `--evidence <ref>` | No | Optional value/eval evidence link/reference |
| `--skip-policy` | No | Skip `hub policy check` before publish (not recommended) |

#### `hx hub eval`

```bash
hx hub eval <id@version> --hub <path-or-git-url> [--local <dir>] [--golden <name>] [--out <file>]
```

| Option | Required | Meaning |
| --- | --- | --- |
| `--hub <path>` | Yes | Hub source |
| `--local <dir>` | No | Evaluate a local asset directory (instead of hub package) |
| `--golden <name>` | No | Evaluate a golden repo check set under `hub/evals/golden-repos/<name>` |
| `--out <file>` | No | Write structured JSON report to file |

#### `hx hub search` and catalog

```bash
hx hub search [query] --hub <path-or-git-url> [--kind <kind>] [--stage <stage>] [--category <cat>] [--index]
hx hub catalog rebuild --hub <path-or-git-url>
```

| Option | Required | Meaning |
| --- | --- | --- |
| `query` | No | Fuzzy text query against id/version/kind/description |
| `--hub <path>` | Yes | Hub source |
| `--kind <kind>` | No | Filter by asset kind (`guide.skill`, `sensor.script`, etc.) |
| `--stage <stage>` | No | Filter by delivery stage (`req`/`arch`/`dev`/`test`) |
| `--category <cat>` | No | `package` \| `bundle` \| `blueprint` |
| `--index` | No | Rebuild `index.json` and exit |

#### `hx hub asset`

```bash
hx hub asset info <id@version> --hub <path-or-git-url>
hx hub asset promote <id@version> --hub <path-or-git-url> --to <status>
hx hub asset deprecate <id@version> --hub <path-or-git-url> --reason <text>
```

| Subcommand | Options | Meaning |
| --- | --- | --- |
| `asset info` | `--hub` | Print category/metadata/review state as JSON |
| `asset promote` | `--hub`, `--to <status>` | Move lifecycle status (`draft/trial/enforced/deprecated/archived`) |
| `asset deprecate` | `--hub`, `--reason <text>` | Mark asset deprecated with explicit reason |

#### `hx hub review`

```bash
hx hub review request <id@version> --hub <path-or-git-url> --by <name>
hx hub review approve <id@version> --hub <path-or-git-url> --reviewer <name>
hx hub review reject <id@version> --hub <path-or-git-url> --reviewer <name> --reason <text>
```

| Subcommand | Options | Meaning |
| --- | --- | --- |
| `review request` | `--hub`, `--by` | Create/reset a pending review request |
| `review approve` | `--hub`, `--reviewer` | Approve review |
| `review reject` | `--hub`, `--reviewer`, `--reason` | Reject review with reason |

#### `hx hub policy` and cache GC

```bash
hx hub policy check --hub <path-or-git-url> [--strict]
hx hub cache gc [--older-than-days <n>]
```

| Command | Options | Meaning |
| --- | --- | --- |
| `policy check` | `--hub` | Run governance checks (approval/owner/hash, etc.) |
|  | `--strict` | Fail on warnings (default fails only on errors) |
| `cache gc` | `--older-than-days <n>` | Remove stale remote mirror cache entries (default `30`) |

#### End-to-end example: publish -> review -> enforce -> query -> verify

```bash
# 1) publish a local asset into Hub with evidence
hx hub promote ./harnessX/assets/guides/secure-api \
  --hub git@github.com:your-org/hx-hub.git \
  --by alice \
  --evidence "ci://runs/1820"

# 2) request + approve review
hx hub review request secure-api@1.2.0 --hub git@github.com:your-org/hx-hub.git --by alice
hx hub review approve secure-api@1.2.0 --hub git@github.com:your-org/hx-hub.git --reviewer bob

# 3) move lifecycle to enforced
hx hub asset promote secure-api@1.2.0 --hub git@github.com:your-org/hx-hub.git --to enforced

# 4) check governance and eval output
hx hub policy check --hub git@github.com:your-org/hx-hub.git --strict
hx hub eval secure-api@1.2.0 --hub git@github.com:your-org/hx-hub.git --out /tmp/secure-api-eval.json

# 5) search/index maintenance and cache gc
hx hub search secure --hub git@github.com:your-org/hx-hub.git --kind guide.skill --stage dev
hx hub catalog rebuild --hub git@github.com:your-org/hx-hub.git
hx hub cache gc --older-than-days 14
```

| Capability | Commands | Purpose |
| --- | --- | --- |
| Hub governance | `hub seed/add/sync/promote/eval/search/catalog/asset/review/policy/cache` | shared asset supply chain |
| Steering | `steer report/distill/publish` | recurrent failure → reusable controls |
| Dashboard/coverage | `view`, `steer coverage --aggregate` | project/org governance |
| MCP bridge | `mcp` | expose `apply_task`, `fix_session`, etc. to IDEs |

---

## 9. Core mental model

1. Behaviour changes live in a **change workspace** (`harnessX/changes/<id>/`), described by delta specs.
2. **Gates**: `hx gate advance` only when sensors pass and preconditions hold; sensor crashes block (fail-closed).
3. Agent input from **Guides/Context Packs**; output checked by **Sensors**; failures include `fix_hint` for the `hx fix` loop.
4. `hx archive` merges deltas into main specs.
5. Recurring failures feed **Steering** → new guides, shared via **Hub**.

## 10. v0.3 / v0.4 / v0.6 layered architecture

| Layer | Capability | Typical config / commands |
| --- | --- | --- |
| **Hub assets** | Packages/bundles/blueprints, search, eval, sync merge | `init --from-hub`, `hub search`, `imports:` |
| **HX orchestration** | Blueprint closure, tier compensation, drift/UAT | `blueprint.yaml`, `drift` sensor |
| **IDE execution** | Adapters + L1 contract | `adapter sync`, `HX_TASK_*`, `hx mcp` |

Enterprise profile adds `prototype-complete`, `uat-complete`, unified `drift`. See [glossary](glossary.md).

## 11. Further reading

- [Usage Guide (by theme)](usage-guide.en.md)
- [19 usage scenarios (by user journey)](examples/en/README.md)
- [Concept glossary](glossary.md)
- [Package boundaries](architecture/package-boundaries.md)
- [L1 env contract JSON Schema](../schemas/l1/agent-env-contract.json)
- [System design document](harness-delivery-system-design.html)
- Repository [README.md](../README.md)
