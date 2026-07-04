# harnessX

仓库: llm-insights-share/harnessX
仓库 ID: 1288692576

## 简介

HarnessX 是面向 AI 编码 Agent（如 Cursor、Claude Code、Codex）的 **Outer Harness 交付系统**。它基于 Martin Fowler 的 Harness Engineering 理念（`Agent = Model + Harness`）与 OpenSpec 规格驱动开发，在 Agent 外层构建一套从需求到归档的完整约束与反馈机制，覆盖 **需求 → 设计 → 编码 → 测试 → 归档** 全生命周期。

HarnessX 不绑定特定 LLM，也不替代 Agent 本身——它是一个 **控制与反馈层**，通过制品管理、阶段门禁、传感器校验与自改进循环，让 AI 辅助交付更可靠、可审计、可度量。

完整设计详见 [`docs/harness-delivery-system-design.html`](docs/harness-delivery-system-design.html)。

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

## 快速开始

1. 克隆仓库：

   git clone https://github.com/llm-insights-share/harnessX.git

2. 进入项目目录：

   cd harnessX

3. 安装依赖并运行（根据项目语言调整）：

   - 若为 Node.js:
     ```bash
     npm install
     npm start
     ```

   - 若为 Python:
     ```bash
     pip install -r requirements.txt
     python main.py
     ```

## 项目结构（示例）

- src/        - 源代码
- docs/       - 文档
- tests/      - 测试
- README.md   - 本文件

## 贡献

欢迎贡献！请按照以下流程：

1. Fork 本仓库
2. 新建分支：`git checkout -b feature/xxx`
3. 提交变更并推送
4. 提交 Pull Request，描述变更内容

## 许可证

本项目默认使用 MIT 许可证（如需其它许可证请替换本节内容）。

## 联系

如需帮助或有问题，请在仓库中打开 issue，或联系仓库维护者。