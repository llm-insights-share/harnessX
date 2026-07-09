# HarnessX 使用场景示例

**English**: [Usage scenarios (English)](en/README.md) · **不知道看哪个？** → [场景选择指南](00-场景选择指南.md)

本目录按**使用者旅程**组织端到端场景（非按版本号堆砌）。每个场景含：**背景与角色**、**逐步命令与期望输出**、**关键机制**。

> 按主题系统入门见 [使用说明](../usage-guide.zh-CN.md)；命令与配置细节见 [操作说明](../operation-guide.zh-CN.md)；概念词表见 [glossary](../glossary.zh-CN.md)。

---

## 快速选型

| 你此刻的目标 | 从这里开始 |
| --- | --- |
| 第一次接入 HarnessX | [01 新项目接入](01-新项目接入.md) |
| 交付一个常规功能 | [02 标准功能全流程](02-标准功能开发全流程.md)（需先 01） |
| 从组织 Hub 初始化 | [16 Hub 蓝图初始化](16-v0.3-hub-blueprint-init.md) |
| 企业级需求→编码交接 | [19 组织 Pre-phase](19-组织级PRD与架构设计.md) → [15 enterprise 交接](15-企业级需求到交付交接.md) |
| 企业 SDLC 工单全流程 | [20 企业 SDLC 工单全流程](20-企业SDLC工单全流程.md)（profile: `enterprise-sdlc`） |
| Codex/脚本无头交付 | [18 精简 harness + MCP](18-精简配置与无头Agent-MCP.md) |
| 不确定 | [00 场景选择指南](00-场景选择指南.md) |

---

## 六条使用者旅程

### 旅程 1 · 入门：从零到第一个 PR

| 场景 | 角色 | 你会做到 |
| --- | --- | --- |
| [01 新项目接入](01-新项目接入.md) | 技术负责人 | init、宪法、hooks/CI、adapter、验证 Cursor 约束 |
| [02 标准功能全流程](02-标准功能开发全流程.md) | 后端开发 | propose→archive 完整循环 |
| [18 精简 harness + MCP](18-精简配置与无头Agent-MCP.md) | 效能/平台 | `imports:` 最小 harness、无头 apply、MCP L1 |

### 旅程 2 · 日常交付：按风险选路径

| 场景 | 何时选 |
| --- | --- |
| [02 标准功能](02-标准功能开发全流程.md) | 常规需求，`standard` profile |
| [03 核心域 strict](03-核心域改动-strict-测试先行.md) | 支付/核心域，测试先行 |
| [05 紧急 hotfix](05-紧急修复-lite.md) | 线上故障，`lite` 快通道 |
| [04 并发冲突](04-并发变更冲突.md) | 多团队同 capability |

### 旅程 3 · 企业交付：多角色与全栈

| 场景 | 何时选 |
| --- | --- |
| [19 组织级 PRD/架构](19-组织级PRD与架构设计.md) | Pre-phase：`docs/prd/` + `docs/architecture/`、`hx approve`、`hx arch promote` |
| [14 全栈多角色](14-企业全栈多角色交付.md) | API + B 端 + C 端五人协作 |
| [15 enterprise 交接](15-企业级需求到交付交接.md) | 需求分析 → HLD/LLD → task-pack |

### 旅程 4 · 平台与治理：Hub 与组织视角

| 场景 | 何时选 |
| --- | --- |
| [08 Hub 供应链](08-hub-资产共享与供应链.md) | promote/review/add/sync/lock |
| [16 Hub 蓝图初始化](16-v0.3-hub-blueprint-init.md) | `init --from-hub`、blueprint、sync 合并 |
| [07 Steering 质量](07-steering-质量治理.md) | 失败 → Skill/Rubric 沉淀 |
| [17 平台看板](17-v0.4-平台治理与仪表盘.md) | prototype/UAT/drift、`hx view`、跨仓 coverage |

### 旅程 5 · 工具与自动化：不止 Cursor

| 场景 | 何时选 |
| --- | --- |
| [09 多工具协作](09-多工具协作与CI强制.md) | Cursor/Trae/Qoder/Claude + CI |
| [13 并行编排](13-v0.2-编排与并行交付.md) | `--parallel`、`--fan-out`、review 标注 |
| [10 自定义 sensor](10-自定义传感器与触发器.md) | 安全扫描、触发器、`hx fix` |
| [18 无头 MCP](18-精简配置与无头Agent-MCP.md) | Tier 2、`HX_TASK_*`、MCP 工具 |

### 旅程 6 · 定制与迁移

| 场景 | 何时选 |
| --- | --- |
| [11 需求模板](11-自定义需求产出模板.md) | 定制 proposal / delta spec |
| [12 设计模板](12-自定义概要设计产出模板.md) | 定制 design / `/hx-design` |
| [06 OpenSpec 迁移](06-遗留项目迁移-openspec.md) | 存量 OpenSpec 导入 |

---

## 场景完整索引

| # | 场景 | 旅程 | 主要能力 |
| --- | --- | --- | --- |
| 00 | [场景选择指南](00-场景选择指南.md) | — | 按角色/目标选型 |
| 01 | [新项目接入](01-新项目接入.md) | 入门 | `init --bundle` / hooks / CI / adapter |
| 02 | [标准功能全流程](02-标准功能开发全流程.md) | 入门·日常 | standard 全阶段 + apply 自校正 |
| 03 | [核心域 strict](03-核心域改动-strict-测试先行.md) | 日常 | testfirst / waiver / 已批准断言 |
| 04 | [并发变更冲突](04-并发变更冲突.md) | 日常 | 域重叠 / `rebase check` |
| 05 | [紧急 hotfix](05-紧急修复-lite.md) | 日常 | lite / `archive --force` |
| 06 | [OpenSpec 迁移](06-遗留项目迁移-openspec.md) | 迁移 | `openspec import` / `sync` |
| 07 | [Steering 质量](07-steering-质量治理.md) | 平台 | distill / rubric / janitor |
| 08 | [Hub 供应链](08-hub-资产共享与供应链.md) | 平台 | hub promote/sync/lock |
| 09 | [多工具协作](09-多工具协作与CI强制.md) | 工具 | adapter 多目标 / CI 强制 |
| 10 | [自定义 sensor](10-自定义传感器与触发器.md) | 工具 | 插件 API / 触发器 / fix |
| 11 | [需求模板](11-自定义需求产出模板.md) | 定制 | guide.template / overrides |
| 12 | [设计模板](12-自定义概要设计产出模板.md) | 定制 | design-template / Context Pack |
| 13 | [并行编排](13-v0.2-编排与并行交付.md) | 工具 | parallel / fan-out / review |
| 14 | [全栈多角色](14-企业全栈多角色交付.md) | 企业 | 多 bundle / `@group` 并行 |
| 15 | [enterprise 交接](15-企业级需求到交付交接.md) | 企业 | requirements / delivery-trace / task-pack |
| 16 | [Hub 蓝图初始化](16-v0.3-hub-blueprint-init.md) | 平台 | `--from-hub` / blueprint / sync --apply |
| 17 | [平台看板](17-v0.4-平台治理与仪表盘.md) | 平台 | prototype/UAT / drift / `hx view` |
| 18 | [精简 harness + MCP](18-精简配置与无头Agent-MCP.md) | 入门·工具 | `imports:` / MCP L1 / 无头 apply |
| 19 | [组织级 PRD/架构](19-组织级PRD与架构设计.md) | 企业·Pre-phase | `/hx-prd` `/hx-arch` `hx arch promote` |

---

## 阅读前提

- 已完成仓库根目录 `npm install`；`hx` = `node bin/hx.js`。
- 人名与业务域均为虚构，用来说明**谁写规格、谁批准、谁实现**。

## 两类操作入口

1. **终端**（`$ hx ...`）：管控面 — 批准、推进、豁免、归档。
2. **Cursor 对话框**（`Cursor ▸`）：执行面 — 写提案、规格、代码；须先 `hx adapter sync`。

经验法则：**agent 能做的走 Cursor；只有人才能做的走终端**（审计留痕）。

## 核心心智模型

1. 改动在 **change 工作区**，用 delta spec 描述增量。
2. **Gate** 全绿 + 前置条件才 `advance`；fail-closed。
3. **Guide** 组装输入，**Sensor** 检验输出；失败进 `hx fix`。
4. **archive** 合并进主规格。
5. **Steering + Hub** 让 harness 持续进化。
