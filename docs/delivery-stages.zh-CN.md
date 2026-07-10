# AI 交付四阶段模型（HarnessX 权威定义）

本文档是 HarnessX **四阶段交付模型**的唯一权威说明，对齐组织 AI 交付阶段划分。

## 四阶段总览

| 阶段 | ID | 产出 | 作用域 |
| --- | --- | --- | --- |
| 需求 | `req` | 产品需求文档 | 组织级 `docs/prd/` |
| 设计 | `arch` | 概要设计 + 子系统详细设计 | 组织级 `docs/architecture/` |
| 开发 | `dev` | 可运行代码 | Change 级 `harnessX/changes/<id>/` |
| 测试 | `test` | 测试用例 + 测试报告 | Change 级 `changes/<id>/test-cases/` |

## 任务清单（必选 / 可选）

### req — 需求

| 任务 | 必选 | HX 命令 / 能力 |
| --- | --- | --- |
| 业务理解 | 否 | `explore`、guide `requirements-research-outline` |
| 需求调研 | 否 | `explore`、`hx req prd` 调研章节 |
| 需求分析 | 是 | sensor `requirements-complete` |
| 产品原型设计 | 是 | guide `prototype-wireframe` |
| 产品需求文档编写 | 是 | `hx req prd init/check`、`hx approve prd` |

### arch — 设计

| 任务 | 必选 | HX 命令 / 能力 |
| --- | --- | --- |
| 子系统划分 | 是 | `hx arch init`、sensor `arch-hld-complete` |
| 技术选型 | 是 | `docs/architecture/overview.md` |
| 数据库设计 | 是 | HLD / LLD 章节 |
| 接口设计（外部/系统间） | 是 | HLD |
| 关键设计机制 | 否 | ADR、`hx waiver` |
| 内部接口设计 | 是 | `hx arch lld`、`arch-lld-approved` |

### dev — 开发（change 流水线）

| 任务 | 必选 | HX 命令 |
| --- | --- | --- |
| 开发计划 | 是 | `hx plan` / `hx dev plan` |
| change:propose | 是 | `hx propose` |
| change:design | 是 | `hx design` |
| change:apply | 是 | `hx apply` |
| change:verify | 是 | `hx verify`（自动化 sensor 套件） |
| change:archive | 是 | `hx archive` |

> 原 `spec` 阶段内容合并入 `propose`（delta spec）与 `design`（设计对齐）。人工批准门为 **design→plan**：`hx gate approve <change> --gate design-to-plan`。

### test — 测试

| 任务 | 必选 | HX 命令 |
| --- | --- | --- |
| 测试用例设计 | 是 | `hx test-cases`、`hx gate check --stage test --task test-case-design` |
| 测试任务执行 | 是 | UAT、`hx bug` 闭环、sensor `uat-complete` |

## 状态机

```text
req (org) → arch (org) → change create → dev (change) → test (change) → 交付完成
```

- **lite profile**：跳过 req/arch gate，直接进入 `dev`
- **standard / enterprise**：四阶段全量
- **enterprise-sdlc**：四阶段 + 工单 + `test-case-design`

## 配置

`harnessX/config.yaml`：

```yaml
delivery_mode: phases   # 默认，兼容 v0.4
# delivery_mode: stages # v0.5 四阶段 gate 引擎
```

迁移：

```bash
hx migrate --dry-run
hx migrate --delivery-mode stages
```

## 命令对照

| 新命令 | 旧命令（兼容 alias） |
| --- | --- |
| `hx req prd *` | `hx prd *` |
| `hx stage status` | — |
| `hx dev status <change>` | — |
| `hx gate check --stage dev --task propose` | `hx gate check --phase propose` |

## Profile 与阶段

| Profile | 阶段 | dev 任务 |
| --- | --- | --- |
| `lite` | dev | propose → apply → archive |
| `standard` | req, arch, dev, test | plan → propose → design → apply → verify → archive |
| `enterprise-sdlc` | 四阶段全量 | 同上 + test: test-case-design → test-execution |

代码权威注册表：[`packages/core/src/stages.ts`](../packages/core/src/stages.ts)
