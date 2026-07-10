# 场景 18：精简 harness 配置与无头 Agent 交付（MCP L1）

| | |
| --- | --- |
| **旅程** | 入门 · 工具与自动化 |
| **适用角色** | 使用 Codex/OpenCode/自研脚本的开发者、平台效能 |
| **前置** | 建议先读 [场景 01](01-新项目接入.md) 了解 harness 基础 |
| **你会做到** | 用 `imports:` 保持 harness 精简；`hx apply --runner` 无头交付；MCP `apply_task` / `fix_session` |
| **关联** | [09 多工具协作](09-多工具协作与CI强制.md)、[02 标准功能](02-标准功能开发全流程.md) |

## 背景

某数据平台团队的 **指标导出 API**（metrics-api）不用 Cursor UI，开发用 **Codex CLI** 在终端挂机改代码。技术负责人 **孙工** 希望：

1. 业务仓库的 `harness.yaml` **尽量短**（拓扑靠 `imports:` 展开，而非复制大段 sensor 列表）；
2. apply 循环通过 **`hx apply --runner`** 注入标准 `HX_TASK_*` 环境变量；
3. Trae 侧通过 **MCP** 调用 `apply_task`、`fix_session`，与 L1 契约对齐。

## 操作步骤

### 1. 初始化：Bundle 或 imports 二选一

**方式 A — 传统 Bundle（与场景 01 相同）：**

```console
$ hx init --bundle api-service
```

**方式 B — 精简 harness + imports（v0.5+ 推荐）：**

```console
$ hx init    # 仅 base 脚手架，不 --bundle
```

编辑 `harnessX/harness.yaml`，只保留 profile 与 imports：

```yaml
version: "1.0"
constitution: constitution.md

imports:
  - api-service

profiles:
  standard:
    stages: [dev]
    dev_tasks: [propose, design, plan, apply, verify, archive]
    suites:
      dev.propose: fast
      dev.apply: fast
      dev.verify: verification

guides: []
sensors: []
dependencies: []
overrides: []
```

验证运行时展开（磁盘文件仍保持精简）：

```console
$ hx bundle list
api-service	Topology bundle for backend API services ...

# 读取时自动合并 api-service 的 guides/sensors
$ node -e "const {Workspace}=require('./packages/core');" 
# 等价：任意 gate 命令会使用展开后的 arch-boundary 等 sensor
```

### 2. 配置弱 IDE 适配器与 Tier 补偿

```console
$ hx adapter sync --targets codex,generic
codex (Tier 2): 1 file(s)
  + AGENTS.md
generic (Tier 2): 1 file(s)

$ cat .harnessx-adapter-tier
2
```

`config.yaml` 可显式打开补偿（Tier 2 默认已启用）：

```yaml
profile: standard
adapter:
  target: codex
compensation:
  enabled: true
  escalate_warn_to_block: true
```

Tier 2 在 verify 阶段会追加 typecheck/lint 等 sensor，弥补无 hooks 的不足。

### 3. 创建 change 并推进到 apply

```console
$ hx change create export-csv --domains metrics
$ hx propose export-csv --title "导出指标 CSV"
$ hx gate check export-csv --stage dev --task propose
$ hx gate approve export-csv --gate design-to-plan --approver sun
$ hx gate advance export-csv
$ hx plan export-csv
wrote harnessX/changes/export-csv/tasks.md (4 tasks)
```

### 4. 无头 apply：`HX_TASK_*` 契约

```console
$ hx apply export-csv --runner 'codex exec --prompt "$HX_TASK_TITLE"' --max-retries 2
task 01a [test] Write test for CSV header (attempt 1)
...
task 01b [impl] Implement CSV export endpoint (attempt 1)
BLOCKER  lint: ...
task 01b [impl] Implement CSV export endpoint (attempt 2)
completed tasks: 01a, 01b, 02a, 02b; remaining: 0
```

每轮 runner 环境包含（见 `schemas/l1/agent-env-contract.json`）：

| 变量 | 含义 |
| --- | --- |
| `HX_TASK_ID` | 当前任务 id（如 `01b`） |
| `HX_TASK_TITLE` | 任务标题 |
| `HX_TASK_PACK` | `tasks/01b-pack.md` 路径 |
| `HX_FIX_HINTS` | 上一轮 sensor 失败提示（自校正） |

手动查看任务包：

```console
$ hx guide task-pack export-csv 01b
wrote harnessX/changes/export-csv/tasks/01b-pack.md (5 sections, 12ms)
```

### 5. MCP L1：IDE 桥接同一契约

在 Trae/Qoder 配置 MCP：`hx mcp`（stdio）。

工具列表包含 v0.5 新增项：

- `apply_task` — 返回 task pack + `env` 对象（`HX_TASK_*`）
- `fix_session` — 返回 fix pack + `HX_FIX_PACK`
- `drift_check` — 统一 drift sensor

示例 JSON-RPC 调用结果（节选）：

```json
{
  "task": "01b",
  "packFile": "harnessX/changes/export-csv/tasks/01b-pack.md",
  "env": {
    "HX_CHANGE": "export-csv",
    "HX_STAGE": "dev",
    "HX_TASK": "apply",
    "HX_TASK_ID": "01b",
    "HX_TASK_TITLE": "Implement CSV export endpoint",
    "HX_TASK_PACK": ".../01b-pack.md",
    "HX_FIX_HINTS": ""
  },
  "contractSchema": "https://harnessx.dev/schemas/l1/agent-env-contract.json"
}
```

Agent 侧只需把 `env` 注入子进程，与 `hx apply --runner` 行为一致。

### 6. 修复会话：`fix_session`

verify 失败后：

```console
$ hx fix --change export-csv --sensor spec-trace --runner 'codex exec --prompt-file "$HX_FIX_PACK"'
fix pack: harnessX/changes/export-csv/fix-pack.md (2 finding(s))
```

MCP 等价调用：`fix_session { "change": "export-csv", "sensor": "spec-trace" }`。

### 7. 验证与归档

```console
$ hx verify export-csv
VERIFIED

$ hx archive export-csv
Archived to harnessX/archive/2026-07-07-export-csv
```

## 关键机制解析

- **`imports:` vs `--bundle`**：`--bundle` 在 init 时把 bundle 物化进 `assets/bundles/` 并写入 harness；`imports:` 在 **readHarness() 时展开**，仓库只提交短 harness + 宪法/覆盖项。
- **L1 契约统一**：终端 `apply --runner`、MCP `apply_task`、未来第三方 runner 共用 `HX_TASK_*` / `HX_FIX_*` JSON Schema，避免每家 IDE 各写一套交接格式。
- **Tier 2 不是降级**：无 hooks 时用更强 sensor 补偿 + 推荐 headless apply，而不是放弃门禁。

## 下一步

- 组织级 Hub： [16 Hub 蓝图初始化](16-v0.3-hub-blueprint-init.md)
- 并行与 Best-of-N： [13 并行编排](13-v0.2-编排与并行交付.md)
