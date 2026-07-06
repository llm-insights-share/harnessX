# HarnessX 操作说明

**English**: [Operation Guide (English)](operation-guide.en.md)

本文档说明如何在日常工作中使用 HarnessX（`hx` CLI）与 AI 编码 agent 协作交付软件变更。更贴近业务的端到端场景见 [`docs/examples/`](examples/README.md)。

## 1. 环境准备

```bash
git clone <your-repo>
cd <your-repo>
npm install
```

示例中以 `hx` 代指 `node bin/hx.js`（或全局安装后的 `hx`）。

## 2. 初始化项目

### 英文默认脚手架

```bash
hx init --bundle api-service
```

### 中文版脚手架（hx-cn）

```bash
hx init --locale hx-cn --bundle api-service-cn
```

`--locale hx-cn` 会安装中文资产：

| 资产 | 说明 |
| --- | --- |
| `constitution.md` | 中文项目宪法 |
| `assets/commands/*.md` | 八个阶段的 `/hx-*` 工作流提示词（中文） |
| `assets/guides/proposal-template/` | 中文提案模板与示例 |
| `assets/guides/design-template/` | 中文概要设计模板与示例 |
| `assets/guides/spec-writing/` | 中文 EARS 规格写作 Skill |
| `assets/guides/coding-conventions/` | 中文编码规范 Skill |
| `harness.yaml` | 中文 `fix_hint` 与资产注册 |

`config.yaml` 会写入 `locale: zh-CN`，`hx propose` / `hx design` / `hx explore` 生成的脚手架亦为中文。

初始化后建议执行：

```bash
hx hooks install    # 本地 git hooks
hx ci init          # GitHub Actions 工作流
hx adapter sync     # 编译到 .cursor/ 等工具目录
```

## 3. 两类操作入口

HarnessX 将「管控面」与「执行面」分离：

| 入口 | 适用场景 | 示例 |
| --- | --- | --- |
| **终端命令** | 人工批准、门禁推进、豁免、归档 | `hx gate approve`、`hx gate advance` |
| **Cursor 对话框** | agent 写提案、写规格、写代码、自校正 | `/hx-propose`、`/hx-apply` |

经验法则：**agent 能自己做的走 Cursor；只有人才能做的走终端**——后者也是审计留痕的落点。

在 Cursor 中使用斜杠命令前须先 `hx adapter sync`。输入 `/` 可见 `hx-explore` … `hx-archive` 八个命令，正文即该阶段的完整工作流。

## 4. 标准交付循环

以 `standard` profile 为例（`lite` / `strict` 见场景 03、05）：

```
explore → propose → design → spec → [人工批准] → plan → apply → verify → archive
```

### 4.1 创建 change

```bash
hx change create add-refund --domains orders,payments
```

须声明 `touched domains`；与其他活跃 change 域重叠时会告警。

### 4.2 Propose — 提案与初版 delta spec

**终端**（仅生成脚手架）：

```bash
hx propose add-refund --title "支持部分退款"
```

**Cursor**：在对话框输入 `/hx-propose`，按中文命令正文填写 `proposal.md` 与 delta spec。

校验：

```bash
hx gate check add-refund --phase spec
```

### 4.3 Design — 概要设计

```bash
hx design add-refund          # 生成 design.md（hx-cn 使用 design-template）
hx gate advance add-refund    # 通过 design 门禁后推进
```

或在 Cursor 使用 `/hx-design`。

### 4.4 Spec — 定稿规格与人工批准

在 Cursor 使用 `/hx-spec` 收紧 EARS 需求与场景覆盖。

**人工**（不可由 agent 代劳）：

```bash
hx gate approve add-refund --gate spec --approver 张三
hx gate advance add-refund
```

### 4.5 Plan — 任务分解

```bash
hx plan add-refund
```

生成 `tasks.md`：每个场景一条 `[test]` 与 `[impl]` 任务。可在 Cursor 用 `/hx-plan` 审阅排序。

### 4.6 Apply — 实现

```bash
hx apply add-refund --runner "<你的 agent 命令>"
# v0.2: 并行与 Best-of-N
hx apply add-refund --parallel 2 --runner "<agent>"
hx apply add-refund --fan-out 3 --runner "<agent>"
```

或在 Cursor 用 `/hx-apply` 逐任务实现。每步后 fast sensor 套件须全绿。

### 4.7 Verify — 完整验证

```bash
hx verify add-refund
```

检查完整 sensor 套件与场景→测试可追溯性。失败时用 `hx fix add-refund` 获取聚焦修复包。

### 4.8 Archive — 合并规格

```bash
hx rebase check add-refund   # 预检与其他 change 的冲突
hx archive add-refund        # 合并 delta 至主规格并归档
```

## 5. 常用命令速查

| 命令 | 作用 |
| --- | --- |
| `hx status` | 查看活跃 change 与门禁状态 |
| `hx gate check <id> [--phase <p>]` | 运行指定阶段 sensor 套件 |
| `hx gate advance <id>` | 推进至下一阶段（须全绿 + 前置条件） |
| `hx gate approve <id> --gate spec --approver <name>` | 记录人工规格批准 |
| `hx guide pack <id> --phase <p>` | 组装该阶段 Context Pack |
| `hx harness lint` | 检测宪法与 Skill 冲突 |
| `hx bundle list` | 列出拓扑包（`api-service`、`event-consumer`、`frontend-dashboard` 及 `*-cn` 中文版） |
| `hx bundle add <id>` | 初始化后追加拓扑包 |
| `hx waiver add <id> --sensor <s> --reason "..." --expires YYYY-MM-DD` | 记录有时限豁免 |
| `hx adapter sync` | 将 harnessX 资产编译到各 AI 工具目录 |
| `hx steer report` | 查看反复失败，候选新 Guide |
| `hx eval guides <id>` | v0.2：Guide 行为评测 |

## 6. 核心心智模型

1. 一切行为改动在 **change 工作区**（`harnessX/changes/<id>/`）进行，通过 delta spec 描述规格增量。
2. 阶段推进靠 **Gate**：`hx gate advance` 仅在该阶段 Sensor 全绿且满足前置条件（如人工批准）时放行；Sensor 崩溃视为阻断（fail-closed）。
3. Agent 输入由 **Guide/Context Pack** 组装，输出由 **Sensor** 检验；失败报告带 `fix_hint`，可进入 `hx fix` 修复回环。
4. `hx archive` 将 delta 合并进主规格；主规格是系统行为的唯一事实源。
5. 反复失败经 **Steering** 蒸馏为新 Guide，经 **Hub** 共享——harness 持续进化。

## 7. 进一步阅读

- [使用场景示例（13 个）](examples/README.md)
- [系统设计文档](harness-delivery-system-design.html)
- [构建计划与状态](build-plan.csv)
- 仓库根目录 [README.md](../README.md)
