# HarnessX Usage Scenario Examples (English)

**中文**: [使用场景示例](../README.md) · **Not sure where to start?** → [Scenario picker](00-scenario-picker.md)

Scenarios are organized by **user journey**, not by version number. Each includes: **background & roles**, **step-by-step commands with expected output**, and **mechanism notes**.

> Thematic overview: [Usage Guide](../usage-guide.en.md) · CLI/config: [Operation Guide](../operation-guide.en.md) · Glossary: [glossary](../glossary.md)

---

## Quick picker

| Your goal right now | Start here |
| --- | --- |
| First-time HarnessX setup | [01 New project onboarding](01-new-project-onboarding.md) |
| Write `constitution.md` | [Constitution examples](../constitutions/README.md) · [Usage guide §2.2](../../usage-guide.en.md#22-constitution-constitutionmd) |
| Ship a regular feature | [02 Standard feature](02-standard-feature-development.md) (after 01) |
| Init from org Hub | [16 Hub blueprint init](16-v0.3-hub-blueprint-init.md) |
| Enterprise requirements → code handoff | [19 Org Pre-phase](19-org-prd-and-architecture.md) → [15 Enterprise handoff](15-enterprise-delivery-handoff.md) |
| Headless Codex/script delivery | [18 Minimal harness + MCP](18-minimal-harness-headless-mcp.md) |
| Not sure | [00 Scenario picker](00-scenario-picker.md) |

---

## Six user journeys

### Journey 1 · Onboarding: zero to first PR

| Scenario | Role | Outcome |
| --- | --- | --- |
| [01 Onboarding](01-new-project-onboarding.md) | Tech lead | init, constitution, hooks/CI, adapter |
| [02 Standard feature](02-standard-feature-development.md) | Developer | Full propose→archive loop |
| [18 Minimal + MCP](18-minimal-harness-headless-mcp.md) | Platform / effectiveness | `imports:`, headless apply, MCP L1 |

### Journey 2 · Daily delivery: pick risk level

| Scenario | When |
| --- | --- |
| [02 Standard](02-standard-feature-development.md) | Regular features, `standard` |
| [03 Strict core](03-core-domain-strict-test-first.md) | Payments/core, test-first |
| [05 Hotfix](05-emergency-hotfix-lite.md) | Production incident, `lite` |
| [04 Concurrent](04-concurrent-change-conflicts.md) | Overlapping teams |

### Journey 3 · Enterprise: multi-role & full-stack

| Scenario | When |
| --- | --- |
| [19 Org PRD/arch](19-org-prd-and-architecture.md) | Pre-phase: `docs/prd/` + `docs/architecture/`, `hx approve`, `hx arch promote` |
| [14 Full-stack roles](14-enterprise-fullstack-multi-role.md) | API + admin + portal |
| [15 Enterprise handoff](15-enterprise-delivery-handoff.md) | Requirements → HLD/LLD → task-pack |

### Journey 4 · Platform & governance

| Scenario | When |
| --- | --- |
| [08 Hub supply chain](08-hub-asset-sharing-supply-chain.md) | promote/review/sync/lock |
| [16 Hub blueprint](16-v0.3-hub-blueprint-init.md) | `--from-hub`, blueprint, sync merge |
| [07 Steering](07-steering-quality-governance.md) | Failures → rules |
| [17 Dashboard](17-v0.4-platform-governance.md) | prototype/UAT/drift, `hx view` |

### Journey 5 · Tools & automation

| Scenario | When |
| --- | --- |
| [09 Multi-tool](09-multi-tool-collaboration-ci-enforcement.md) | Cursor/Trae/Qoder/Claude + CI |
| [13 Orchestration](13-v0.2-orchestration-parallel-delivery.md) | parallel, fan-out, review |
| [10 Custom sensors](10-custom-sensors-triggers.md) | Security, triggers, fix loop |
| [18 Headless MCP](18-minimal-harness-headless-mcp.md) | Tier 2, `HX_TASK_*`, MCP |

### Journey 6 · Customize & migrate

| Scenario | When |
| --- | --- |
| [11 Requirements template](11-custom-requirements-output-template.md) | Proposal / delta spec |
| [12 Design template](12-custom-design-output-template.md) | Design / `/hx-design` |
| [06 OpenSpec migration](06-legacy-migration-openspec.md) | Legacy OpenSpec import |

---

## Full scenario index

| # | Scenario | Journey | Capabilities |
| --- | --- | --- | --- |
| 00 | [Scenario picker](00-scenario-picker.md) | — | Role/goal navigation |
| 01 | [Onboarding](01-new-project-onboarding.md) | Onboarding | `init --bundle` / hooks / CI |
| 02 | [Standard feature](02-standard-feature-development.md) | Onboarding·Daily | standard loop + self-correction |
| 03 | [Strict core](03-core-domain-strict-test-first.md) | Daily | testfirst / waiver |
| 04 | [Concurrent changes](04-concurrent-change-conflicts.md) | Daily | domain overlap / rebase |
| 05 | [Emergency hotfix](05-emergency-hotfix-lite.md) | Daily | lite / `archive --force` |
| 06 | [OpenSpec migration](06-legacy-migration-openspec.md) | Migrate | import / sync |
| 07 | [Steering quality](07-steering-quality-governance.md) | Platform | distill / rubric |
| 08 | [Hub supply chain](08-hub-asset-sharing-supply-chain.md) | Platform | hub sync/lock |
| 09 | [Multi-tool CI](09-multi-tool-collaboration-ci-enforcement.md) | Tools | adapters / CI |
| 10 | [Custom sensors](10-custom-sensors-triggers.md) | Tools | plugins / triggers |
| 11 | [Requirements template](11-custom-requirements-output-template.md) | Customize | guide.template |
| 12 | [Design template](12-custom-design-output-template.md) | Customize | design-template |
| 13 | [Parallel orchestration](13-v0.2-orchestration-parallel-delivery.md) | Tools | parallel / fan-out |
| 14 | [Full-stack roles](14-enterprise-fullstack-multi-role.md) | Enterprise | multi-bundle |
| 15 | [Enterprise handoff](15-enterprise-delivery-handoff.md) | Enterprise | task-pack / delivery-trace |
| 16 | [Hub blueprint init](16-v0.3-hub-blueprint-init.md) | Platform | `--from-hub` / sync --apply |
| 17 | [Platform dashboard](17-v0.4-platform-governance.md) | Platform | prototype/UAT / view |
| 18 | [Minimal harness + MCP](18-minimal-harness-headless-mcp.md) | Onboarding·Tools | `imports:` / MCP L1 |
| 19 | [Org PRD/arch](19-org-prd-and-architecture.md) | Enterprise·Pre-phase | `/hx-prd` `/hx-arch` `hx arch promote` |

---

## Prerequisites

- `npm install` at repo root; `hx` = `node bin/hx.js`.
- Names and domains are fictional to illustrate **who writes specs, approves, implements**.

## Two entry points

1. **Terminal** (`$ hx ...`): control plane — approval, advance, waivers, archive.
2. **Cursor dialog** (`Cursor ▸`): execution plane — drafts and code; requires `hx adapter sync`.

Rule of thumb: **agent work in Cursor; human-only actions in the terminal** (audit trail).

## Mental model

1. Changes live in **change workspaces** with delta specs.
2. **Gates** advance only when sensors pass; fail-closed.
3. **Guides** assemble input; **Sensors** check output; failures → `hx fix`.
4. **archive** merges into main specs.
5. **Steering + Hub** evolve the harness.
