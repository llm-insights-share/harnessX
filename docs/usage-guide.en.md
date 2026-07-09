# HarnessX Usage Guide

**中文**: [使用说明（中文）](usage-guide.zh-CN.md)

This guide explains HarnessX **by theme** so you can learn core concepts, pre-init personalization, and special-project customization in one place. It complements the [Operation Guide](operation-guide.en.md) (organized by delivery phase) and [Usage scenario examples](examples/en/README.md) (19 end-to-end journeys).

| Document | Organization | When to read |
| --- | --- | --- |
| **This guide** | Concepts → init config → special projects | First systematic overview, or before customizing templates/rules |
| [Operation Guide](operation-guide.en.md) | Requirements → design → coding → testing | Daily command/field lookup |
| [Scenario examples](examples/en/README.md) | User journeys | Walk through a full story |
| [Glossary](glossary.md) | Terminology | When a term is unclear |

---

## Table of contents

1. [Theme 1: Core concepts and typical scenarios](#theme-1-core-concepts-and-typical-scenarios)
2. [Theme 2: Personalization before initialization](#theme-2-personalization-before-initialization)
3. [Theme 3: Special projects and deep customization](#theme-3-special-projects-and-deep-customization)
4. [Appendix: Quick reference and further reading](#appendix-quick-reference-and-further-reading)

---

## Theme 1: Core concepts and typical scenarios

### 1.1 What HarnessX is

HarnessX (`hx` CLI) is an **outer harness (control plane)** around AI coding agents — not an agent itself, and not merely a test framework or CI pipeline.

It models AI software delivery as a **control engineering** problem:

- **Guides (feedforward)**: Skills, templates, constitution — tell the agent *how* to work
- **Sensors (feedback)**: lint, tests, spec validation — check *whether* output is correct
- **Gates**: phase advancement only when sensors pass (fail-closed)

See the [README](../README.md) for the full differentiation table vs test frameworks, CI, and OpenSpec alone.

### 1.2 Core concepts

| Concept | Meaning | Location |
| --- | --- | --- |
| **Harness instance** | Initialized project workspace | `harnessX/` |
| **Change** | One delivery unit | `harnessX/changes/<id>/` |
| **Profile** | Workflow tier (phases + sensor suites) | `config.yaml` + `harness.yaml` |
| **Guide** | Feedforward asset | `assets/guides/` |
| **Sensor** | Feedback check | reports in `runs/` |
| **Gate** | Phase advancement; fail-closed | `meta.yaml`, `hx gate` |
| **Bundle** | Topology pack (e.g. API service) | `imports:` or `assets/bundles/` |
| **Blueprint** | Delivery path preset | `blueprint.yaml` |
| **Hub** | Org asset registry | separate Git repo or path |
| **Adapter** | Single source → multi-IDE compile | `.cursor/`, `AGENTS.md`, etc. |

Asset resolution priority: `change > local > team > hub > builtin`. Undeclared overrides need `overrides:` with `reason` in `harness.yaml`.

Full definitions: [Glossary](glossary.md).

### 1.3 Three harness domains

| Domain | Constrains | Typical guide | Typical sensor |
| --- | --- | --- | --- |
| **Maintainability** | Style, complexity | coding-conventions | lint, typecheck |
| **Architecture fitness** | Boundaries, performance | performance-budget | arch-boundary, budget |
| **Behaviour** | Correctness vs specs | spec-writing, delta specs | spec-validate, spec-trace |

### 1.4 Phases and two entry points

Standard profile: `propose → design → spec → plan → apply → verify → archive`

| Entry | Use for | Examples |
| --- | --- | --- |
| **Terminal `$ hx ...`** | Control plane: approve, advance, waive, archive | `hx gate approve`, `hx archive` |
| **Cursor chat** | Execution: write specs, code, self-correct | `/hx-propose`, `/hx-design`, `/hx-apply` |

Rule of thumb: **agent work in Cursor; human accountability in the terminal**.

Run `hx adapter sync` before using slash commands.

### 1.5 Typical scenario: zero to first PR

**Role**: tech lead on a new project  
**Walkthrough**: [Scenario 01 — New project onboarding](examples/en/01-new-project-onboarding.md)

```bash
hx init --bundle api-service
# Edit harnessX/constitution.md
hx hooks install && hx ci init && hx adapter sync
hx change create my-feature --domains billing
# Cursor ▸ /hx-propose my-feature
hx gate approve my-feature --gate spec --approver alice
hx plan my-feature && hx apply my-feature --runner "<agent>"
hx verify my-feature && hx archive my-feature
```

Key mechanisms: change workspace + delta specs; three enforcement layers (IDE rules → hooks → CI); single-source assets in `harnessX/assets/`.

### 1.6 Typical scenario: standard feature delivery

**Walkthrough**: [Scenario 02 — Standard feature development](examples/en/02-standard-feature-development.md)

Delta specs use OpenSpec format; `spec-validate` blocks bad EARS/scenarios in the propose phase.

### 1.7 Choose profile by risk

| Profile | When | Scenario |
| --- | --- | --- |
| **lite** | Hotfix, tiny change | [05 Emergency hotfix](examples/en/05-emergency-hotfix-lite.md) |
| **standard** | Most features | [02 Standard feature](examples/en/02-standard-feature-development.md) |
| **strict** | Core domains, test-first | [03 Core domain strict](examples/en/03-core-domain-strict-test-first.md) |
| **enterprise** | Multi-role delivery | [19](examples/en/19-org-prd-and-architecture.md) → [15](examples/en/15-enterprise-delivery-handoff.md), [14](examples/en/14-enterprise-fullstack-multi-role.md) |

#### Enterprise Pre-phase (org-level artifacts)

Before enterprise change delivery, complete org Pre-phase ([Scenario 19](examples/en/19-org-prd-and-architecture.md)):

```text
/hx-prd → hx prd check → hx approve prd <slug> --approver <name>
/hx-arch → hx arch check → hx approve arch --approver <name>
/hx-arch-lld <module> → hx arch lld check <module>
hx change create <id> --prd <slug> --arch-modules <module> --profile enterprise
```

`hx guide pack` **auto-injects** `docs/prd/` and `docs/architecture/` into Context Packs during propose/design. Before archive, run `hx arch promote <change>` to write change design back into module LLD.

### 1.8 Platform / org scenarios

| Goal | Scenario |
| --- | --- |
| Central Hub distribution | [08 Hub supply chain](examples/en/08-hub-asset-sharing-supply-chain.md) |
| Init from Hub blueprint | [16 Hub blueprint init](examples/en/16-v0.3-hub-blueprint-init.md) |
| Failure → new rules | [07 Steering quality](examples/en/07-steering-quality-governance.md) |
| Dashboards / coverage | [17 Platform governance](examples/en/17-v0.4-platform-governance.md) |

### 1.9 Multi-tool and headless agents

| Goal | Scenario |
| --- | --- |
| Cursor + Trae + Claude | [09 Multi-tool + CI](examples/en/09-multi-tool-collaboration-ci-enforcement.md) |
| Codex / scripts | [18 Minimal harness + MCP](examples/en/18-minimal-harness-headless-mcp.md) |
| Parallel apply | [13 Orchestration](examples/en/13-v0.2-orchestration-parallel-delivery.md) |
| Custom sensors | [10 Custom sensors](examples/en/10-custom-sensors-triggers.md) |

Tier 2 adapters trigger **gate compensation** (extra sensors, warn→block). See [config.yaml compensation](operation-guide.en.md#31-harnessxconfigyaml).

### 1.10 Mental model (six points)

1. Behaviour changes live in a **change workspace** with delta specs.
2. **Gates** advance only when sensors pass + preconditions (e.g. human approval); crashes block (fail-closed).
3. **Guides** assemble phase Context Packs; **Sensors** validate output with `fix_hint` → `hx fix`.
4. **`hx archive`** merges deltas into main specs (source of truth).
5. **Org Pre-phase** (`docs/prd/`, `docs/architecture/`) and **change-level delivery** coexist; `hx guide pack` injects org artifacts; `hx arch promote` writes back module LLD before archive.
6. **Steering + Hub** evolve the harness itself across the org.

---

## Theme 2: Personalization before initialization

> **Best practice**: finish this section **before** the team's first change.

### 2.1 Choose an init path

| Path | Command | When |
| --- | --- | --- |
| **A. Topology bundle** | `hx init --bundle <id>` | Self-contained repo |
| **B. Minimal imports** | `hx init` + `imports: [<id>]` | Short `harness.yaml` (v0.5+) |
| **C. Org Hub** | `hx init --from-hub <id>@<ver> --hub <path>` | Central platform assets |
| **D. Enterprise blueprint** | `hx init --from-hub enterprise-delivery@1.0.0` | Multi-role delivery |
| **E. Chinese scaffold** | add `--locale hx-cn` | Chinese constitution, hints |

Built-in bundles: `api-service`, `frontend-2c`, `frontend-dashboard`, `event-consumer`, `library-sdk`, `serverless-function`, `mobile-app`, `data-pipeline` (+ `*-cn` variants). List with `hx bundle list`.

Post-init essentials:

```bash
hx hooks install && hx ci init && hx adapter sync
```

### 2.2 Constitution `constitution.md`

Highest-priority guide: 5–10 immutable principles + `core-domains:` for strict recommendations. Run `hx harness lint` after edits.

### 2.3 Workflow `config.yaml`

Set `profile`, `locale`, optional `hub`, `adapter.target`, and `compensation` for Tier 2 IDEs. See [Operation Guide §3.1](operation-guide.en.md#31-harnessxconfigyaml).

### 2.4 Asset registry `harness.yaml`

Central registration for guides, sensors, suites. Prefer:

```yaml
imports:
  - api-service
profiles:
  standard:
    phases: [propose, design, spec, plan, apply, verify, archive]
    suites:
      spec: fast
      apply: fast
      verify: verification
```

Add team skills under `assets/guides/`; use `overrides:` with `reason` to replace Hub/builtin assets.

### 2.5 Blueprint `blueprint.yaml`

Presets profile, `hub_deps`, and phase → guide/sensor mapping. Apply via `hx init --from-hub <blueprint>@<ver>`.

### 2.6 Customize requirements output

**Walkthrough**: [Scenario 11 — Custom requirements template](examples/en/11-custom-requirements-output-template.md)

- `proposal-template` → rendered by `hx propose`
- `spec-writing` Skill → EARS and naming conventions
- Gate **requires** `## Why`, `## What Changes`, `## Impact`; delta format still enforced by `spec-validate`

### 2.7 Customize design output

**Walkthrough**: [Scenario 12 — Custom design template](examples/en/12-custom-design-output-template.md)

Register `design-template` as `guide.template` for the design phase; customize `/hx-design` via `assets/commands/design.md`.

### 2.8 Coding conventions and architecture constraints

Override `coding-conventions` Skill or bundle `layering.yaml` + matching `arch-boundary` sensor.

### 2.9 Pre-install from Hub

```bash
hx hub seed ./harness-hub
hx init --from-hub api-service@1.0.0 --hub ./harness-hub
hx hub add prd-writing@1.0.0 --hub ./harness-hub && hx lock write
```

### 2.10 Pre-first-change checklist

- [ ] `constitution.md` with core domains
- [ ] `config.yaml` profile/locale/hub
- [ ] Bundle or Hub deps in `harness.yaml`
- [ ] Templates customized (scenarios 11–12) if needed
- [ ] `hx harness lint` passes
- [ ] hooks + CI + adapter sync done
- [ ] `harness.lock` committed
- [ ] Cursor `/hx` commands verified
- [ ] Branch protection per `BRANCH_PROTECTION.md`

---

## Theme 3: Special projects and deep customization

### 3.1 Legacy OpenSpec migration

**Walkthrough**: [Scenario 06](examples/en/06-legacy-migration-openspec.md)

```bash
hx openspec import --from openspec
hx sync
```

Optional `compat_mode: openspec` in `config.yaml` for short-term parallel use.

### 3.2 Enterprise multi-role delivery

**Walkthrough**: [19](examples/en/19-org-prd-and-architecture.md) (org Pre-phase) → [15](examples/en/15-enterprise-delivery-handoff.md), [14](examples/en/14-enterprise-fullstack-multi-role.md)

```bash
hx init --from-hub enterprise-delivery@1.0.0 --hub ./harness-hub
```

`enterprise-delivery` blueprint adds org-level `docs/prd/` + `docs/architecture/` (Pre-phase), change-level `requirements/`, `design/` HLD+LLD, `delivery-trace.yaml`, `@design=` handoff, `hx guide task-pack`, and `hx arch promote` before archive.

Extra sensors: `prd-complete`, `prd-approved`, `arch-approved`, `arch-change-align`, `requirements-complete`, `design-hld-complete`, `prototype-complete`, `uat-complete`, `design-drift`, `arch-drift`, etc.

### 3.3 Multi-topology / full-stack monorepo

```yaml
imports:
  - api-service
  - frontend-dashboard
  - frontend-2c
```

Use `@group` in `tasks.md` with `hx apply --parallel`.

### 3.4 Core domain strict / test-first

**Walkthrough**: [Scenario 03](examples/en/03-core-domain-strict-test-first.md)

`strict` profile + `hx testfirst generate/approve` + hash-locked approved fixtures.

### 3.5 Emergency hotfix (lite)

**Walkthrough**: [Scenario 05](examples/en/05-emergency-hotfix-lite.md)

`--profile lite`; `hx archive --force` only with care; follow up with a standard change.

### 3.6 Custom sensors and triggers

**Walkthrough**: [Scenario 10](examples/en/10-custom-sensors-triggers.md)

Register `plugin: "cmd:..."` sensors; use `trigger: file-save` for save-time scans.

### 3.7 Headless: minimal harness + MCP

**Walkthrough**: [Scenario 18](examples/en/18-minimal-harness-headless-mcp.md)

`imports:` only + `hx apply --runner` + `hx mcp` + L1 env vars (`HX_TASK_*`, `HX_FIX_*`).

### 3.8 Concurrent changes

**Walkthrough**: [Scenario 04](examples/en/04-concurrent-change-conflicts.md)

Declare `--domains`; run `hx rebase check` before archive; CODEOWNERS on specs.

### 3.9 Org Hub lifecycle

**Walkthrough**: [Scenario 08](examples/en/08-hub-asset-sharing-supply-chain.md)

promote → review → enforce → `hub add` → `lock write` → `hub sync --apply`.

### 3.10 Steering loop

**Walkthrough**: [Scenario 07](examples/en/07-steering-quality-governance.md)

`hx steer report/distill/publish` — improve the harness, not just one bugfix.

### 3.11 Author org bundles / blueprints

Hub layout: `packages/`, `bundles/`, `blueprints/`, `evals/`. See built-in `packages/bundles/api-service/bundle.yaml` as a template.

### 3.12 Special project quick picker

| Project | Config | Scenario |
| --- | --- | --- |
| New backend API | `api-service` bundle | 01 |
| Legacy OpenSpec | `openspec import` | 06 |
| Payments / core | `strict` + testfirst | 03 |
| Enterprise BA+arch+dev | `enterprise-delivery` | [19](examples/en/19-org-prd-and-architecture.md) → 15, 14 |
| Many repos | Central Hub + lock | 08, 16 |
| No Cursor | imports + MCP | 18 |
| Security extension | custom sensor | 10 |
| Hotfix | `lite` | 05 |
| Custom templates | overrides | 11, 12 |

---

## Appendix: Quick reference and further reading

### A. Common commands

Init: `hx init`, `hx bundle`, `hx hooks install`, `hx ci init`, `hx adapter sync`  
Pre-phase (org): `hx prd`, `hx arch`, `hx arch lld`, `hx approve prd/arch`, `hx arch promote`  
Change lifecycle: `hx change`, `hx propose/design/plan/apply/verify/archive`  
Gates: `hx gate check/advance/approve/replay`  
Quality: `hx trace check`, `hx sync`, `hx fixture`, `hx testfirst`  
Hub: `hx hub seed/add/sync/promote/search/eval/review`  
Governance: `hx steer`, `hx view`, `hx lock`  
Headless: `hx apply --runner`, `hx mcp`, `hx fix`

Full options: [Operation Guide](operation-guide.en.md).

### B. Documentation index

| Doc | Purpose |
| --- | --- |
| [Operation Guide](operation-guide.en.md) | Phase-based commands |
| [Scenario picker](examples/en/00-scenario-picker.md) | Choose among 19 scenarios |
| [Glossary](glossary.md) | Terms |
| [Design doc](harness-delivery-system-design.html) | Full design |
| [README](../README.md) | Overview |

---

*Keep in sync with the HarnessX repo; `hx <cmd> --help` is authoritative for CLI behavior.*
