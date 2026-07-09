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

**Setup:** Edit `blueprint.yaml`, then install via Hub (scenario [16](examples/en/16-v0.3-hub-blueprint-init.md)) or `hx init --from-hub <blueprint>@<ver> --hub <path-or-git-url>`.

### 3.4 `harnessX/constitution.md`

Highest-priority project principles (domains, non-negotiables). Always included in Context Packs.

**Setup:** Edit immediately after init; run `hx harness lint` to catch skill contradictions.

### 3.5 `harnessX/harness.lock`

Generated by `hx lock write`; pins resolved asset versions and content hashes. Commit to git; CI uses `hx lock verify`.

---

## 4. Four-Stage Operating Model (main structure)

Per your request, this guide is organized by: **Requirements → Design → Implementation → Testing**.

### 4.1 Two entry points

| Entry | Use for | Examples |
| --- | --- | --- |
| **Terminal** | approvals, gate transitions, waivers, archive | `hx gate approve`, `hx archive` |
| **Cursor dialog** | draft specs/design, code, self-correction | `/hx-propose`, `/hx-design`, `/hx-apply` |

Rule of thumb: **agent work in Cursor; human accountability actions in terminal**.

### 4.2 Stage map

| Stage | Goal | Typical commands |
| --- | --- | --- |
| **Pre-phase (org)** | PRD, global HLD, module LLD | `hx prd`, `hx arch`, `hx approve prd/arch` |
| Requirements | reviewable intent + delta specs | `change create`, `propose`, `gate check --phase propose`, `gate approve` |
| Design | implementable technical design | `design`, `gate check --phase design`, `gate advance` |
| Implementation | task-by-task coding + self-correction | `plan`, `apply`, `guide task-pack`, `fix` |
| Testing | verify, trace, promote, archive | `verify`, `trace check`, `arch promote`, `archive` |

### 4.3 Pre-phase commands (org-level, `docs/` artifacts)

| Command | Purpose |
| --- | --- |
| `hx prd init <slug>` / `hx prd check <slug>` | Org PRD scaffold / validation |
| `hx approve prd <slug> --approver <name>` | PRD sign-off (alias for `hx gate approve --gate prd --prd <slug>`) |
| `hx arch init` / `hx arch check` | Global HLD scaffold / `arch-check` suite (includes `arch-approved`) |
| `hx approve arch --approver <name>` | Global HLD sign-off |
| `hx arch lld init <module>` / `hx arch lld check <module>` | Module LLD scaffold / validation |
| `hx arch promote <change> [--by <name>]` | Structured change design → module LLD |
| `hx guide prd-pack <slug>` / `hx guide arch-pack` | Pre-phase Context Packs |

Cursor slash commands: `/hx-prd`, `/hx-arch`, `/hx-arch-lld` (after `hx adapter sync`).

### 4.4 Dual-track artifact model

| Track | Path | Lifecycle | Human approval |
| --- | --- | --- | --- |
| **Org (Pre-phase)** | `docs/prd/`, `docs/architecture/` | Reused across changes | `hx approve prd/arch` → `docs/.prephase-approvals.yaml` |
| **Change (delivery)** | `harnessX/changes/<id>/requirements/`, `design/`, `specs/` | One delivery | `hx gate approve <change> --gate spec` → `meta.yaml` |

`hx guide pack` **auto-injects** org artifacts into Context Packs during propose/design. Before archive, `hx arch promote` **writes back** change design into org module LLD.

---

## 5. Requirements Stage

### 5.1 Outputs

- `harnessX/changes/<id>/proposal.md`
- `harnessX/changes/<id>/specs/**` (delta specs)
- (enterprise) `requirements/` (PRD distillation)
- approval records in `meta.yaml`
- Context Pack includes linked **org PRD** (`meta.prdRef` or `docs/prd/<change>.md`)

### 5.2 Recommended flow

**standard / strict**:

```bash
hx change create add-refund --domains orders,payments
hx propose add-refund --title "Support partial refunds"
hx gate check add-refund --phase propose
# After spec is finalized, approve spec→plan:
hx gate check add-refund --phase spec
hx gate approve add-refund --gate spec --approver alice
hx gate advance add-refund
```

**enterprise** (complete [Scenario 19](examples/en/19-org-prd-and-architecture.md) Pre-phase first):

```bash
hx change create add-refund --domains orders --profile enterprise \
  --prd orders-refund --arch-modules order
hx propose add-refund --title "Support partial refunds"
hx gate check add-refund --phase propose   # includes prd-complete, prd-approved
```

### 5.3 Commands and all options (this stage)

| Command | Options | Meaning |
| --- | --- | --- |
| `change create <id>` | `--domains <list>` | touched domains (comma-separated) |
|  | `--profile <name>` | override default profile |
|  | `--prd <slug>` | link org PRD (enterprise) |
|  | `--arch-modules <list>` | link org module LLD (enterprise) |
|  | `--from-issue <url>` | scaffold from GitHub issue |
| `change list` | — | list active changes |
| `propose <change>` | `--title <title>` | proposal title (default `Untitled`) |
| `gate check <change>` | `--phase <cmd>` | check specified phase (default: next phase) |
| `gate approve [change]` | `--gate <gate>` | change-level: `spec`, etc.; org-level: `prd`/`arch` |
|  | `--approver <name>` | required approver name |
|  | `--prd <slug>` | required for org-level PRD approval |
| `approve prd <slug>` | `--approver <name>` | PRD approval shorthand |
| `approve arch` | `--approver <name>` | global HLD approval shorthand |
| `gate advance <change>` | — | advance if gate passes |

### 5.4 Stage-specific configuration

- Ensure `config.yaml.profile` matches your governance level.
- Ensure `harness.yaml` has a spec-stage suite for your profile.
- For stricter behavior on weaker IDEs:

```yaml
compensation:
  enabled: true
  escalate_warn_to_block: true
```

---

## 6. Design Stage

### 6.1 Outputs

- `design/overview.md` (rendered by `design-template`)
- (enterprise) `design/ui/pages.md`, LLD files
- Context Pack includes **org HLD**, **registry**, **module LLD**
- design gate records (enterprise: `arch-approved`, `prototype-complete`, etc.)

### 6.2 Recommended flow

```bash
# enterprise: ensure hx approve arch completed
hx design add-refund
hx guide pack add-refund --phase design --out /tmp/design-pack.md
hx gate check add-refund --phase design
hx gate advance add-refund
```

### 6.3 Commands and options

| Command | Options | Meaning |
| --- | --- | --- |
| `design <change>` | — | scaffold design after design gate checks |
| `guide pack <change>` | `--phase <cmd>` | required (typically `design`) |
|  | `--out <file>` | write pack to file |
| `gate check <change>` | `--phase design` | run design-phase suite |
| `gate advance <change>` | — | move to next phase |

### 6.4 Stage-specific configuration

Declare design assets in blueprint:

```yaml
phases:
  design:
    guides: [prototype-wireframe]
```

This allows automatic wiring into `harness.yaml` when applying blueprints.

---

## 7. Implementation Stage

### 7.1 Outputs

- `tasks.md` (dual-track tasks)
- per-task packs `tasks/<taskId>-pack.md`
- implementation commits and apply gate records

### 7.2 Recommended flow

```bash
hx plan add-refund
hx apply add-refund --runner "<agent-cmd>"
hx guide task-pack add-refund 01b
```

### 7.3 Commands and all options

| Command | Options | Meaning |
| --- | --- | --- |
| `plan <change>` | — | generate dual-track tasks |
| `apply <change>` | `--runner <cmd>` | command per task (`HX_TASK_*`, `HX_FIX_HINTS`, `HX_TASK_PACK`) |
|  | `--max-retries <n>` | self-correction retries (default `3`) |
|  | `--limit <n>` | stop after N tasks |
|  | `--parallel <n>` | concurrent tasks in same group (default `1`) |
|  | `--fan-out <n>` | isolated best-of-N worktree execution |
| `guide task-pack <change> <taskId>` | `--out <file>` | write scoped task pack |
| `fix` | `--change <id>` | required change id |
|  | `--sensor <id>` | required failing sensor id |
|  | `--runner <cmd>` | optional fix session command (`HX_FIX_PACK`) |
| `runtime worktree <action> [change]` | `--slot <id>`, `--path <path>` | create/list/remove isolated worktrees |

### 7.4 Stage-specific configuration

For headless/weak IDE workflows:

```bash
hx adapter sync --targets codex,generic
```

Optional `config.yaml`:

```yaml
adapter:
  target: codex
compensation:
  enabled: true
```

---

## 8. Testing Stage

### 8.1 Outputs

- verification suite passes
- scenario→test traceability coverage
- fixture/meta integrity checks
- archived change merged into main specs

### 8.2 Recommended flow

```bash
hx verify add-refund
hx trace check add-refund
hx fixture verify
hx rebase check add-refund
# enterprise: promote change design to org module LLD before archive
hx arch promote add-refund --by architect
hx archive add-refund
```

### 8.3 Commands and all options

| Command | Options | Meaning |
| --- | --- | --- |
| `verify <change>` | — | run full verification and set verified state |
| `trace check [change]` | `--all` | coverage checks for one/all changes |
| `sync` | — | spec↔code drift detection |
| `fixture approve <file>` | `--by <name>` | approve fixture baseline |
| `fixture verify` | — | detect fixture drift |
| `testfirst generate <change>` | — | create strict-profile test stubs |
| `testfirst approve <change>` | `--files <list>`, `--by <name>` | approve/hash-lock tests |
| `waiver add <change>` | `--target <target>` | required target (`sensor`, `scenario:`, `tests:`) |
|  | `--reason <reason>` | required reason |
|  | `--requested-by <name>` | required requester |
|  | `--approved-by <name>` | required approver |
|  | `--expires <iso>` | expiry time |
| `waiver list <change>` | — | list active/expired waivers |
| `arch promote <change>` | `--by <name>`, `--dry-run` | enterprise: structured design → module LLD |
| `archive <change>` | `--force` | skip verified-state requirement (careful); enterprise blocks without promote |
| `rebase check <change>` | — | pre-archive conflict check |
| `meta verify [change]` | `--all` | tamper detection for meta chain |

Waiver example:

```bash
hx waiver add add-refund \
  --target lint \
  --reason "Third-party SDK false positive, manually verified" \
  --requested-by alice \
  --approved-by bob \
  --expires 2026-04-01T00:00:00Z
```

CI recommendation:

```bash
hx gate replay
hx trace check --all
hx fixture verify
hx meta verify --all
```

---

## 9. Cross-Stage Platform Capabilities (optional)

### 9.1 Hub asset management commands (new in this upgrade)

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
hx hub search [query] --hub <path-or-git-url> [--kind <kind>] [--phase <phase>] [--category <cat>] [--index]
hx hub catalog rebuild --hub <path-or-git-url>
```

| Option | Required | Meaning |
| --- | --- | --- |
| `query` | No | Fuzzy text query against id/version/kind/description |
| `--hub <path>` | Yes | Hub source |
| `--kind <kind>` | No | Filter by asset kind (`guide.skill`, `sensor.script`, etc.) |
| `--phase <phase>` | No | Filter by phase (`propose`, `design`, `apply`, `verify`, ...) |
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
hx hub search secure --hub git@github.com:your-org/hx-hub.git --kind guide.skill --phase apply
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

## 10. Core mental model

1. Behaviour changes live in a **change workspace** (`harnessX/changes/<id>/`), described by delta specs.
2. **Gates**: `hx gate advance` only when sensors pass and preconditions hold; sensor crashes block (fail-closed).
3. Agent input from **Guides/Context Packs**; output checked by **Sensors**; failures include `fix_hint` for the `hx fix` loop.
4. `hx archive` merges deltas into main specs.
5. Recurring failures feed **Steering** → new guides, shared via **Hub**.

## 11. v0.3 / v0.4 / v0.5 layered architecture

| Layer | Capability | Typical config / commands |
| --- | --- | --- |
| **Hub assets** | Packages/bundles/blueprints, search, eval, sync merge | `init --from-hub`, `hub search`, `imports:` |
| **HX orchestration** | Blueprint closure, tier compensation, drift/UAT | `blueprint.yaml`, `drift` sensor |
| **IDE execution** | Adapters + L1 contract | `adapter sync`, `HX_TASK_*`, `hx mcp` |

Enterprise profile adds `prototype-complete`, `uat-complete`, unified `drift`. See [glossary](glossary.md).

## 12. Further reading

- [Usage Guide (by theme)](usage-guide.en.md)
- [19 usage scenarios (by user journey)](examples/en/README.md)
- [Concept glossary](glossary.md)
- [Package boundaries](architecture/package-boundaries.md)
- [L1 env contract JSON Schema](../schemas/l1/agent-env-contract.json)
- [System design document](harness-delivery-system-design.html)
- Repository [README.md](../README.md)
