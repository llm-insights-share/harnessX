# HarnessX 概念词表

一页速查：HX、Hub 与交付编排中的核心术语。

## 分层模型（谁负责什么）

| 层 | 名称 | 职责 |
|----|------|------|
| L1 | AI Coding IDE | Agent 运行时（Cursor、Trae、Qoder 等）。通过 Adapter 输出与 L1 环境契约（`HX_TASK_*`、`HX_FIX_*`）消费指南。 |
| L2 | hx-hub | 共享资产注册表（packages、bundles、blueprints）。Git 目录或团队 hub 根路径。 |
| L3 | HX 编排 | `hx` CLI — 门禁、apply 循环、上下文包、强制机制。 |

## 核心概念

### HX（HarnessX）

围绕 AI 编程 Agent 的**外 harness**：规格驱动交付，含 **guides**（方向）、**sensors**（验证）、**gates**（阶段推进）。HX 不替代 IDE，而是协调 Agent 可见内容与推进前必须通过的检查。

### Harness 实例

已初始化的项目工作区：`harnessX/` 含 `harness.yaml`（资产注册表）、`config.yaml`（项目选择）、`constitution.md`，以及 `changes/` 下按 change 组织的制品。

### Change

一次交付工作单元（功能、修复、迁移）。每个 change 有 `meta.yaml`（阶段状态）、delta spec、可选设计与任务，以及 `changes/<id>/assets/` 下的资产覆盖层。

### Profile（工作流配置）

`harness.yaml` 中的工作流（如 `standard`、`enterprise`），定义经过哪些阶段，以及各阶段门禁绑定哪些 sensor **套件（suite）**。

### Suite（套件）

具名 sensor id 列表（如 `fast`、`verification-enterprise`），在 `hx gate check` 时一并执行。

### Bundle（拓扑包）

面向某类拓扑的可复用 guides/sensors/suites 切片（如 `api-service`）。通过 `harness.yaml` 的 `imports:` 引用，或安装到 `assets/bundles/`。

### Blueprint（交付蓝图）

交付路径预设（`blueprint.yaml`）：继承 profile、声明 `hub_deps`、映射 **阶段 → guides/sensors**。应用 blueprint 会将缺失引用写入 `harness.yaml`。

### Asset（资产）

带 `asset.yaml` 清单的版本化目录单元：guide、sensor、编排模式或 hub 包。生命周期：draft → trial → enforced → deprecated。

### Asset Layer（资产解析层）

同一 asset id 多处出现时的优先级：

`change > local > team > hub > builtin`

未声明的覆盖需在 `harness.yaml` 的 `overrides:` 中写明原因。

### Tier（适配器能力档）

L1 IDE 的能力档位（0 / 1 / 2），由 Adapter 声明的能力（commands、skills、hooks、MCP 等）推导。低档触发 **门禁补偿**（额外 sensor、warn 升格为 block）。

## 两种「层」的含义

| 术语 | 含义 |
|------|------|
| 组织分层 L1/L2/L3 | IDE → Hub → 编排（上表） |
| 资产层 Asset Layer | 单个 asset id 的解析栈（change/local/team/hub/builtin） |

## L1 标准契约

Tier-1 Agent 通过环境变量接收结构化交接（见 `schemas/l1/agent-env-contract.json`）：

- **Apply**：`HX_TASK_ID`、`HX_TASK_TITLE`、`HX_TASK_PACK`、`HX_FIX_HINTS` 等
- **Fix**：`HX_FIX_PACK`、`HX_FIX_SENSOR`、`HX_FIX_HINTS`

MCP 工具 `apply_task`、`fix_session`、`drift_check` 向 IDE 桥接暴露相同契约。

## 包边界（扩展点）

| 导入路径 | 职责 |
|----------|------|
| `@harnessx/core` → `orchestration` | 门禁、apply、指南、L1 契约、MCP |
| `@harnessx/core` → `hub` | Hub 同步、blueprint、imports、资产解析 |
| `@harnessx/adapters` | 将 harness 资产编译为 IDE 专用文件 |

第三方扩展：自定义 sensor（`@harnessx/sensors` 模式）、hub 包、拓扑 bundle、adapter emitter。
