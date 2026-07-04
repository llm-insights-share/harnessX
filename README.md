# HarnessX

HarnessX is an **outer harness** for AI coding agents: it constrains the full AI delivery
process — requirements → design → coding → testing — with spec-driven artifacts,
feedforward **Guides**, feedback **Sensors**, fail-closed **Gates**, and a **Steering loop**
that continuously improves the harness itself.

Design document: [`docs/harness-delivery-system-design.html`](docs/harness-delivery-system-design.html)
· Build plan & status: [`docs/build-plan.csv`](docs/build-plan.csv)
· **Usage scenario examples**: [`docs/examples/en/`](docs/examples/en/README.md) (English) · [`docs/examples/`](docs/examples/README.md) (中文) — 10 end-to-end scenarios (new project onboarding, standard development flow, strict test-first, concurrent conflicts, emergency hotfix, legacy migration, Steering governance, Hub sharing, multi-tool collaboration, custom sensors)

## 先进特性与差异化

HarnessX 将 AI 软件交付视为 **控制工程问题**，而非简单的「给 Agent 加几条规则」。以下特性使其区别于常见的测试框架、CI 流水线、静态规则集或单纯的 OpenSpec 工作流：

### 控制论式的 Guides + Sensors 双环模型

大多数类似产品只提供单向约束：要么是静态 Prompt / Rules（前馈），要么是 CI 跑完才知道结果（反馈）。HarnessX 同时构建两条闭环：

- **Guides（前馈控制）**：按阶段注入 Skills、规格、模板等 Context Pack，在 Agent 行动前给出精确指引
- **Sensors（反馈控制）**：在 Agent 行动后运行 lint、测试、规格校验、AI 审查等检查，输出带 `fix_hint` 的结构化报告，驱动 Agent 自校正

Computational Sensor（确定性、毫秒级）与 Inferential Sensor（语义级、较慢）分层部署：便宜检查前置到每次迭代，昂贵检查后置到 PR/CI，实现 **Shift Quality Left**。

### 三大 Harness 域，而非只做代码质量

| 域 | 约束对象 | 典型 Guides | 典型 Sensors |
|----|----------|-------------|--------------|
| **Maintainability** | 代码质量、风格 | AGENTS.md、编码 Skills | ESLint、类型检查、复杂度 |
| **Architecture Fitness** | 模块边界、性能、可观测性 | 性能预算、拓扑模板 | 结构测试、性能探针 |
| **Behaviour** | 功能正确性 vs 需求 | Delta Specs、场景、Approved Fixtures | 规格校验、追溯映射、E2E、变异测试 |

测试框架和 CI 通常只覆盖 Maintainability。HarnessX 将 **Behaviour Harness** 作为一等公民——通过规格真值源、Spec-to-Test 追溯与人工批准的 Fixtures，而非依赖 Agent 自行生成的测试质量。

### Steering Loop：Harness 自我进化

当同类失败重复出现（如 Agent 反复违反架构边界），HarnessX 的 Steering Loop 会：

1. 记录到 **Failure Catalog**
2. 识别模式并生成 **Harness Patch 提案**（新 Skill 条目、ArchUnit 规则、模板更新）
3. 版本化 **Harness Template**（按 API 服务、事件消费者等拓扑预置 Guides + Sensors）

这是元循环：系统改进的是 **如何约束 Agent**，而不只是 Agent 写出的代码。

### 规格与测试分离，追溯可审计

HarnessX 继承 OpenSpec 的 Delta Spec 格式（ADDED/MODIFIED/REMOVED + GIVEN/WHEN/THEN），并扩展 `traceability.yaml` 将每个场景映射到测试用例与源文件。P0 场景缺少测试映射时，Verify/Archive 阶段会被 Sensor 阻断。关键场景使用 **Approved Fixtures**——预期输出由人工批准，Agent 不可修改，避免「AI 写测试、AI 验测试」的自嗨循环。

### 阶段感知的 Context Pack，避免指令污染

Guide Engine 按阶段精确组装上下文：Propose 阶段不注入完整代码库，Spec 阶段不注入实现代码。这与散落在各处的 Cursor Rules / AGENTS.md 不同——所有 Guides 与 Sensors 统一注册于 `harness.yaml`，避免互相矛盾的指令。

### 与类似产品的核心差异

| 类别 | 常见做法 | HarnessX 的不同 |
|------|----------|-----------------|
| 单元/集成测试框架 | 对已有代码跑测试 | 编排 **整个交付过程**；测试只是 Sensor 之一 |
| CI/CD 流水线 | 提交后验证 | 在 Agent **每次迭代**中运行快速 Sensor，并将修正信号回灌 Agent |
| Lint / 静态分析 | 代码质量门禁 | 与 Behaviour、Architecture Sensor 统一编排 |
| BDD 框架 | 人写场景 → 生成测试 | OpenSpec Delta Spec + 追溯映射 + Approved Fixtures，规格即仓库真值 |
| OpenSpec 单独使用 | 规格驱动、阶段灵活 | 扩展设计/验证阶段、三大 Harness 域、Sensor 门禁与 Steering Loop |
| Agent Rules / AGENTS.md | 静态 Prompt | **阶段感知**、集中注册，并与匹配 Sensor 配对 |
| AI Code Review 工具 | PR 事后审查 | 作为 Inferential Sensor 集成到门禁，输出 Agent 可消费的 `fix_hint` |

**一句话定位**：HarnessX 不是测试运行器，不是仿真框架，也不是 Agent 本身——它是让编码 Agent 足够可靠以支撑生产交付的 **Outer 控制平面**。

## Quick start

```bash
npm install
node bin/hx.js init --bundle api-service   # scaffold harnessX/ in your repo
node bin/hx.js change create add-auth --domains auth
node bin/hx.js propose add-auth --title "Session expiry"
node bin/hx.js gate advance add-auth       # gates advance only when sensors pass
node bin/hx.js plan add-auth               # dual-track tasks (test + impl per requirement)
node bin/hx.js apply add-auth --runner "<your agent command>"
node bin/hx.js verify add-auth             # verification suite + traceability
node bin/hx.js archive add-auth            # merge delta specs into main specs
node bin/hx.js adapter sync                # compile to .cursor/ .trae/ .qoder/ CLAUDE.md AGENTS.md
```

## Repository layout

| Path | Contents |
| --- | --- |
| `packages/core` | Schemas (Zod), artifact store & delta merge, gate state machine, sensor runner (fail-closed), guide engine, traceability, fixtures, waivers, steering, assets/lock/hub, triggers, plugin API |
| `packages/sensors` | Built-in sensors: spec-validate (EARS), spec-trace, fixture-hash, approved-tests, arch-boundary, budget, rubric |
| `packages/adapters` | Single-source → multi-target compiler with capability tiers (Cursor / Trae / Qoder / Claude Code / generic `AGENTS.md`) |
| `packages/cli` | `hx` command-line interface (Commander) |
| `packages/bundles` | Built-in `base` scaffold and the `api-service` topology bundle |
| `docs/` | Design document (HTML) and build plan (CSV) |

## Key enforcement properties

- **Fail-closed gates** — a sensor that crashes, times out or emits garbage blocks the gate (FR-053).
- **meta.yaml exclusive writes** — gate state is hash-chained to sensor logs; manual edits are detected by `hx meta verify` in CI (FR-050).
- **Human approval gate** — spec→plan always requires a recorded approver with an artifact hash (FR-012).
- **Approved fixtures & test-first** — human-approved fixtures/tests are hash-locked; drift blocks (FR-025/026).
- **Supply chain** — `harness.lock` pins asset content hashes; hub packages pass an instruction-injection scan before installation (NFR-009).

## Development

```bash
npm run verify     # typecheck + all 86 tests (unit + milestone acceptance + full-cycle E2E)
npm test           # tests only
```
