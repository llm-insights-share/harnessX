# HarnessX

HarnessX is an **outer harness** for AI coding agents: it constrains the full AI delivery
process — requirements → design → coding → testing — with spec-driven artifacts,
feedforward **Guides**, feedback **Sensors**, fail-closed **Gates**, and a **Steering loop**
that continuously improves the harness itself.

**v0.6** unifies the **four-stage delivery model** (`req` → `arch` → `dev` → `test`) as the default gate engine:
`hx req` / `hx arch` / `hx dev` / `hx test`, `hx gate check --stage --task`, and
[delivery-stages.zh-CN.md](docs/delivery-stages.zh-CN.md) as the authoritative stage reference.
**v0.4** adds native **enterprise SDLC** orchestration: `enterprise-sdlc` profile, work orders (`hx wo`),
change requests (`hx cr`), test-stage test-case-design, bug/retest loop, `hx approve arch-lld`, and
[scenario 20](docs/examples/20-企业SDLC工单全流程.md) walkthrough.
**v0.3** (historical) adds organization-level req/arch workflows (M18–M20): `/hx-prd`, `/hx-arch`, `/hx-arch-lld`, org approvals,
Context Pack injection, `hx arch promote`, and **19** scenario walkthroughs ([19](docs/examples/19-组织级PRD与架构设计.md) → [15](docs/examples/15-企业级需求到交付交接.md)).
Also includes v0.3 layered upgrade: `imports:` minimal harness, Hub `sync --apply`, blueprint init, gate compensation.
**v0.2** adds orchestration: parallel apply (`--parallel`), best-of-N worktree fan-out (`--fan-out`),
diff review annotations → fix hints, guide behavior evals, GitHub issue scaffolding, and `hx notify`.
**Enterprise delivery** adds `requirements/` analysis artifacts, `design/` HLD+LLD packages,
`delivery-trace.yaml`, `@design=` task handoff, and `hx guide task-pack` for scoped apply context.
Organization **req** and **arch** stages (M18/M19) maintain `docs/prd/` and `docs/architecture/`; see
[scenario 19](docs/examples/19-组织级PRD与架构设计.md) → [scenario 15](docs/examples/15-企业级需求到交付交接.md).

Design document: [`docs/harness-delivery-system-design.html`](docs/harness-delivery-system-design.html)
· Build plan & status: [`docs/build-plan.csv`](docs/build-plan.csv)
· **Usage guides (by theme)**: [`docs/usage-guide.en.md`](docs/usage-guide.en.md) (English) · [`docs/usage-guide.zh-CN.md`](docs/usage-guide.zh-CN.md) (中文 — 核心概念、初始化配置、特殊项目定制)
· **hxhub usage (Hub ops + asset maintenance)**: [`docs/hxhub-usage.zh-CN.md`](docs/hxhub-usage.zh-CN.md) (中文) · [`docs/hub-asset-maintenance.en.md`](docs/hub-asset-maintenance.en.md) (English stub)
· **Operation guides (by stage)**: [`docs/operation-guide.en.md`](docs/operation-guide.en.md) (English) · [`docs/operation-guide.zh-CN.md`](docs/operation-guide.zh-CN.md) (中文)
· **Usage scenario examples**: [`docs/examples/`](docs/examples/README.md) (中文) · [`docs/examples/en/`](docs/examples/en/README.md) (English) — **20 user-journey scenarios** ([picker](docs/examples/00-场景选择指南.md)) covering onboarding, daily delivery, enterprise req/arch, platform governance, headless MCP, and more

## Advanced Features & Differentiation

HarnessX treats AI software delivery as a **control engineering problem**, not simply "adding a few rules for the agent." The following capabilities set it apart from typical test frameworks, CI pipelines, static rule sets, or OpenSpec workflows alone:

### Cybernetic Guides + Sensors dual-loop model

Most similar products offer only one-way constraints: either static prompts/rules (feedforward) or post-hoc CI results (feedback). HarnessX builds both closed loops:

- **Guides (feedforward control)**: Inject Skills, specs, templates, and other Context Packs by stage and task, giving precise guidance before the agent acts
- **Sensors (feedback control)**: Run lint, tests, spec validation, AI review, and other checks after the agent acts, emitting structured reports with `fix_hint` fields to drive self-correction

Computational Sensors (deterministic, millisecond-scale) and Inferential Sensors (semantic, slower) are deployed in layers: cheap checks run on every iteration; expensive checks are deferred to PR/CI — **shift quality left**.

### Three harness domains — not just code quality

| Domain | What it constrains | Typical Guides | Typical Sensors |
|--------|-------------------|----------------|-----------------|
| **Maintainability** | Code quality, style | AGENTS.md, coding Skills | ESLint, typecheck, complexity |
| **Architecture Fitness** | Module boundaries, performance, observability | Performance budgets, topology templates | Structural tests, performance probes |
| **Behaviour** | Functional correctness vs requirements | Delta Specs, scenarios, Approved Fixtures | Spec validation, traceability mapping, E2E, mutation testing |

Test frameworks and CI typically cover Maintainability only. HarnessX treats the **Behaviour Harness** as a first-class concern — through spec truth sources, Spec-to-Test traceability, and human-approved fixtures — rather than relying on test quality the agent generates on its own.

### Steering Loop: harness self-evolution

When the same failure recurs (e.g., the agent repeatedly violates architecture boundaries), HarnessX's Steering Loop:

1. Records it in the **Failure Catalog**
2. Identifies patterns and generates **Harness Patch proposals** (new Skill entries, ArchUnit rules, template updates)
3. Versions **Harness Templates** (pre-bundled Guides + Sensors by topology: API service, event consumer, etc.)

This is a meta-loop: the system improves **how it constrains the agent**, not just the code the agent writes.

### Specs and tests separated, traceability auditable

HarnessX inherits OpenSpec's Delta Spec format (ADDED/MODIFIED/REMOVED + GIVEN/WHEN/THEN) and extends it with `traceability.yaml` to map each scenario to test cases and source files. P0 scenarios without test mapping are blocked by Sensors at the dev `verify` and `archive` tasks. Critical scenarios use **Approved Fixtures** — expected outputs approved by humans, immutable by the agent — avoiding the "AI writes tests, AI validates tests" self-referential loop.

### Stage-aware Context Packs, avoiding instruction pollution

The Guide Engine assembles context precisely per stage and task: the dev `propose` task does not inject the full codebase; the dev `apply` task does not inject org-level PRD drafts. Unlike scattered Cursor Rules / AGENTS.md files, all Guides and Sensors are centrally registered in `harness.yaml`, preventing contradictory instructions.

### Core differences from similar products

| Category | Typical approach | How HarnessX differs |
|----------|------------------|----------------------|
| Unit/integration test frameworks | Run tests on existing code | Orchestrates the **entire delivery process**; tests are just one sensor type |
| CI/CD pipelines | Validate after commit | Runs fast Sensors on **every agent iteration** and feeds correction signals back to the agent |
| Lint / static analysis | Code quality gates | Unified orchestration with Behaviour and Architecture Sensors |
| BDD frameworks | Human-written scenarios → generated tests | OpenSpec Delta Spec + traceability mapping + Approved Fixtures; specs are repo truth |
| OpenSpec alone | Spec-driven, flexible workflow | Extends with req/arch/dev/test stages, three harness domains, Sensor gates, and Steering Loop |
| Agent Rules / AGENTS.md | Static prompts | **Stage-aware**, centrally registered, paired with matching Sensors |
| AI code review tools | Post-hoc PR review | Integrated as Inferential Sensors in gates, outputting agent-consumable `fix_hint` |

**In one sentence**: HarnessX is not a test runner, not a simulation framework, and not an agent itself — it is the **outer control plane** that makes coding agents reliable enough for production delivery.

## Quick start

```bash
npm install
node bin/hx.js init --bundle api-service   # scaffold harnessX/ in your repo
node bin/hx.js init --locale hx-cn --bundle api-service-cn   # Chinese scaffold (hx-cn)
node bin/hx.js hub seed ./harness-hub       # golden Hub packages (api-conventions, common-review-rubrics)
node bin/hx.js hub sync --hub ./harness-hub --apply   # three-way merge upstream updates
node bin/hx.js init --from-hub api-service@1.0.0 --hub ./harness-hub   # init from hub bundle
node bin/hx.js hooks install && node bin/hx.js ci init && node bin/hx.js adapter sync

# Four-stage delivery: req → arch → dev → test
node bin/hx.js req prd init add-auth --title "Session expiry"   # req stage (org)
node bin/hx.js req prd check add-auth
node bin/hx.js gate approve --gate prd --prd add-auth --approver alice
node bin/hx.js arch init --title "Auth subsystem"              # arch stage (org)
node bin/hx.js arch check
node bin/hx.js gate approve --gate arch --approver bob

node bin/hx.js change create add-auth --domains auth --prd add-auth
node bin/hx.js propose add-auth --title "Session expiry"
node bin/hx.js gate check add-auth --stage dev --task propose
node bin/hx.js design add-auth
node bin/hx.js gate check add-auth --stage dev --task design
node bin/hx.js gate approve add-auth --gate design-to-plan --approver alice
node bin/hx.js plan add-auth && node bin/hx.js apply add-auth --runner "<your agent command>"
node bin/hx.js gate check add-auth --stage dev --task verify && node bin/hx.js archive add-auth
node bin/hx.js gate check add-auth --stage test --task test-execution
node bin/hx.js stage status add-auth
```

## Repository layout

| Path | Contents |
| --- | --- |
| `packages/core` | Schemas (Zod), artifact store & delta merge, gate state machine, sensor runner (fail-closed), guide engine, traceability, fixtures, waivers, steering, assets/lock/hub, triggers, plugin API |
| `packages/sensors` | Built-in sensors: spec-validate (EARS), spec-trace, fixture-hash, approved-tests, arch-boundary, budget, rubric |
| `packages/adapters` | Single-source → multi-target compiler with capability tiers (Cursor / Trae / Qoder / Claude Code / generic `AGENTS.md`) |
| `packages/cli` | `hx` command-line interface (Commander) |
| `packages/bundles` | Built-in `base` / `hx-cn` scaffolds and topology bundles: `api-service`, `event-consumer`, `frontend-dashboard`, `frontend-2c`, `library-sdk`, `serverless-function`, `mobile-app`, `data-pipeline` (+ `*-cn` locales) |
| `docs/` | Design document (HTML) and build plan (CSV) |

## Key enforcement properties

- **Fail-closed gates** — a sensor that crashes, times out or emits garbage blocks the gate (FR-053).
- **meta.yaml exclusive writes** — gate state is hash-chained to sensor logs; manual edits are detected by `hx meta verify` in CI (FR-050).
- **Human approval gate** — spec→plan always requires a recorded approver with an artifact hash (FR-012).
- **Approved fixtures & test-first** — human-approved fixtures/tests are hash-locked; drift blocks (FR-025/026).
- **Supply chain** — `harness.lock` pins asset content hashes; hub packages pass an instruction-injection scan before installation (NFR-009).

## Development

```bash
npm run verify     # typecheck + all 96 tests (unit + milestone acceptance + full-cycle E2E)
npm test           # tests only
```
