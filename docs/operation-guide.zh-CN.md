# HarnessX 操作说明

**English**: [Operation Guide (English)](operation-guide.en.md)

本文档说明如何在日常工作中使用 HarnessX（`hx` CLI）与 AI 编码 agent 协作交付软件变更。文中**凡涉及命令均列出全部选项及含义**；**凡需使用者配置的文件均给出样例与配置步骤**。端到端场景见 [`docs/examples/`](examples/README.md)。

---

## 1. 环境准备

```bash
git clone <your-repo>
cd <your-repo>
npm install
```

示例中以 `hx` 代指 `node bin/hx.js`（或全局安装后的 `hx`）。查看任意子命令帮助：

```bash
hx --help
hx gate check --help
```

---

## 2. 初始化项目

### 2.1 `hx init`

在仓库根目录创建 `harnessX/` 脚手架。

```bash
hx init [选项]
```

| 选项 | 必填 | 含义 |
| --- | --- | --- |
| `--bundle <id>` | 否 | 初始化时合并拓扑 Bundle。内置：`api-service`、`api-service-cn`、`frontend-dashboard`、`library-sdk`、`serverless-function`、`mobile-app`、`data-pipeline` 及对应 `*-cn` |
| `--locale <id>` | 否 | 脚手架语言。`hx-cn` = 中文资产（宪法、命令提示词、模板、fix_hint） |
| `--from-hub <id>@<ver>` | 否 | 从 Hub 安装包/Bundle/蓝图（**须同时** `--hub`） |
| `--hub <path>` | 与 `--from-hub` 联用 | Hub 仓库根目录（本地路径或 git clone 路径） |
| `--adapter <target>` | 否 | 写入 `config.yaml` 的默认适配器目标（`cursor`、`codex`、`trae` 等） |

**示例 — 英文默认 + API 拓扑：**

```bash
hx init --bundle api-service
```

**示例 — 中文脚手架：**

```bash
hx init --locale hx-cn --bundle api-service-cn
```

**示例 — 从 Hub 拉取（v0.3+ 推荐）：**

```bash
hx hub seed ./harness-hub
hx init --from-hub api-service@1.0.0 --hub ./harness-hub
hx init --from-hub enterprise-delivery@1.0.0 --hub ./harness-hub --adapter cursor
hx init --locale hx-cn --from-hub api-service@1.0.0 --hub ./harness-hub
```

初始化后建议执行：

```bash
hx hooks install
hx ci init
hx adapter sync
```

| 后续命令 | 作用 |
| --- | --- |
| `hx hooks install` | 安装本地 git hooks（apply 阶段快速门禁） |
| `hx ci init` | 生成 GitHub Actions 回放工作流 |
| `hx adapter sync` | 将 harnessX 资产编译到 `.cursor/` 等 IDE 目录 |

### 2.2 `hx bundle`

```bash
hx bundle list [--hub <path>]
hx bundle add <bundleId>
```

| 子命令 / 选项 | 含义 |
| --- | --- |
| `list` | 列出内置拓扑 Bundle |
| `list --hub <path>` | 列出 Hub 中 `bundles/` 下的 Bundle（输出 `id@version`） |
| `add <bundleId>` | 将 Bundle 合并进当前 `harness.yaml` 并复制资产到 `assets/bundles/<id>/` |

---

## 3. 配置文件详解

HarnessX 将**项目选择**（`config.yaml`）与**资产注册表**（`harness.yaml`）分离。日常多数定制只需改这两个文件。

### 3.1 `harnessX/config.yaml`

记录本仓库的工作流选择与 Hub/适配器设置。

**最小样例：**

```yaml
profile: standard
locale: en
```

**完整样例（含 Hub、适配器、Tier 补偿）：**

```yaml
profile: enterprise          # 默认工作流：lite | standard | strict | enterprise
locale: zh-CN                # en | zh-CN — 影响脚手架与部分提示文案

hub: ./harness-hub           # Hub 根路径；供 hub add/sync/search 与 imports 解析

adapter:
  target: cursor             # 主 IDE 目标，供文档与 notify 使用
  tier: 1                    # 可选手动覆盖；通常由 adapter sync 自动检测

compensation:
  enabled: true              # Tier 2 适配器时自动加强门禁
  extra_verify_sensors:      # 可选：额外追加的 sensor id
    - typecheck
    - lint
  escalate_warn_to_block: true # 将 warn 级 sensor 升格为 block
```

**配置步骤：**

1. 初始化后打开 `harnessX/config.yaml`。
2. 将 `profile` 设为团队默认工作流（小改动用 `lite`，常规功能用 `standard`，强合规用 `strict`/`enterprise`）。
3. 使用中央 Hub 时，将 `hub` 设为 Hub 目录的**相对或绝对路径**。
4. 运行 `hx adapter sync --targets cursor`（或你的 IDE），Tier 会写入 `.harnessx-adapter-tier`；若需固定补偿策略，再编辑 `compensation`。
5. 中文团队设 `locale: zh-CN`（可与 `hx init --locale hx-cn` 配合）。

### 3.2 `harnessX/harness.yaml`

资产注册表：profiles、suites、guides、sensors、Hub 依赖与拓扑 imports。

**精简样例（靠 imports 展开拓扑，v0.5+）：**

```yaml
version: "1.0"
constitution: constitution.md

imports:
  - api-service              # 运行时合并 api-service bundle 的 guides/sensors/suites

profiles:
  standard:
    phases: [propose, design, spec, plan, apply, verify, archive]
    suites:
      spec: fast
      apply: fast
      verify: verification

suites: {}                   # imports 会合并 verification 等套件
guides: []                   # imports / hub 可自动填充
sensors: []
dependencies: []
overrides: []
```

**完整片段样例 — 自定义 guide + sensor：**

```yaml
guides:
  - id: team-api-style
    kind: guide.skill
    execution: inferential
    phase: [apply]
    source: assets/guides/team-api-style/SKILL.md

sensors:
  - id: secscan
    kind: sensor.script
    execution: computational
    phase: [verify]
    trigger: phase              # phase | file-save | schedule
    builtin: lint                 # 或 plugin: ./plugins/secscan.mjs
    on_fail: block                # block | warn | retry
    max_retries: 0
    fix_hint: "修复安全扫描报告中的问题后重跑 hx gate check"
    timeout_ms: 120000

overrides:
  - id: coding-conventions
    source: assets/guides/team-coding/SKILL.md
    reason: "团队规范覆盖内置约定，经架构评审 2026-03-01 批准"
```

**字段说明：**

| 区块 | 字段 | 含义 |
| --- | --- | --- |
| 顶层 | `imports` | 拓扑 Bundle 引用（`bundle-id` 或 `bundle-id@1.0.0`），`readHarness()` 时展开，不修改磁盘上的 guides/sensors |
| 顶层 | `dependencies` | Hub 包列表（`pkg@version`），由 `hx hub add` 维护 |
| 顶层 | `overrides` | 跨层覆盖资产时必须声明 `reason` |
| `profiles.<name>` | `phases` | 该 profile 经过的阶段命令列表 |
| `profiles.<name>` | `suites` | 阶段 → 套件名映射 |
| `suites.<name>` | （数组） | sensor id 列表 |
| `guides[]` | `id`, `kind`, `source`, `phase`, `execution` | 指南注册 |
| `sensors[]` | `builtin` / `plugin` / `run` | 三选一指定执行方式 |

**配置步骤 — 追加团队 Skill：**

1. 在 `harnessX/assets/guides/<id>/` 创建 `asset.yaml` 与 `SKILL.md`。
2. 在 `harness.yaml` 的 `guides` 追加条目（或 `hx hub add` 后由 blueprint 自动写入）。
3. 运行 `hx lock write` 固定版本哈希。
4. `hx harness lint` 检查与宪法/其他 Skill 是否冲突。

### 3.3 `harnessX/blueprint.yaml`

交付路径预设（profile + Hub 依赖 + 阶段资产映射）。

**样例：**

```yaml
name: standard-delivery
extends: standard                    # 应用时写入 config.yaml 的 profile
hub_deps:
  - prd-writing@1.0.0
  - prototype-wireframe@1.0.0
phases:
  propose:
    guides: [prd-writing]            # 缺失时自动解析并写入 harness.yaml
  design:
    guides: [prototype-wireframe]
  verify:
    sensors: [drift, uat-complete]
```

**配置步骤：** 编辑 `blueprint.yaml` 后，在已配置 `config.yaml.hub` 的仓库执行 Hub 蓝图安装流程（见场景 [16](examples/16-v0.3-hub-blueprint-init.md)），或通过 `hx init --from-hub <blueprint>@<ver> --hub <path>` 初始化。

### 3.4 `harnessX/constitution.md`

项目最高优先级原则（域边界、不可妥协约束）。Agent 的 Context Pack 始终包含此文件。

**配置步骤：** 初始化后立即编辑，写明核心域、禁止事项、测试/安全底线；`hx harness lint` 会检测 Skill 与宪法矛盾。

### 3.5 `harnessX/harness.lock`

由 `hx lock write` 生成，记录已解析资产的版本与内容哈希。提交到 git，CI 用 `hx lock verify` 防篡改。

---

## 4. 双入口操作模型

| 入口 | 适用场景 | 示例 |
| --- | --- | --- |
| **终端** | 人工批准、门禁推进、豁免、归档 | `hx gate approve`、`hx gate advance` |
| **Cursor 对话框** | agent 写提案、规格、代码、自校正 | `/hx-propose`、`hx-apply` |

经验法则：**agent 能自己做的走 Cursor；只有人才能做的走终端**。

使用斜杠命令前须 `hx adapter sync`。输入 `/` 可见 `hx-explore` … `hx-archive` 八个命令。

---

## 5. 标准交付循环

以 `standard` profile 为例：

```
explore → propose → design → spec → [人工批准] → plan → apply → verify → archive
```

### 5.1 创建 change — `hx change create`

```bash
hx change create <id> [选项]
```

| 选项 | 必填 | 含义 |
| --- | --- | --- |
| `--domains <list>` | 是* | 逗号分隔的触及域（如 `orders,payments`） |
| `--profile <name>` | 否 | 覆盖默认 profile |
| `--from-issue <url>` | 否 | 从 GitHub Issue URL 脚手架（域可从 label 推断） |

\* 使用 `--from-issue` 时可省略 `--domains`。

```bash
hx change create add-refund --domains orders,payments
hx change list    # 列出活跃 change：id、状态、profile、域
```

### 5.2 Propose — `hx propose` / `/hx-propose`

```bash
hx propose <change> [--title <title>]
```

| 选项 | 默认 | 含义 |
| --- | --- | --- |
| `--title` | `Untitled` | 写入 `proposal.md` 的标题 |

```bash
hx gate check add-refund --phase spec
```

### 5.3 Design — `hx design`

```bash
hx design <change>    # 无额外选项；内部先跑 design 门禁再写 design 脚手架
hx gate advance add-refund
```

### 5.4 Spec — 人工批准

```bash
hx gate approve <change> --gate <gate> --approver <name>
hx gate advance <change>
```

| `gate approve` 选项 | 必填 | 含义 |
| --- | --- | --- |
| `--gate` | 是 | 被批准的门禁名，通常为 `spec` |
| `--approver` | 是 | 批准人姓名（审计留痕） |

### 5.5 Plan — `hx plan`

```bash
hx plan <change>    # 从 delta spec 生成双轨 tasks.md，无选项
```

### 5.6 Apply — `hx apply`

```bash
hx apply <change> [选项]
```

| 选项 | 默认 | 含义 |
| --- | --- | --- |
| `--runner <cmd>` | — | 每任务执行的 shell 命令；注入 `HX_TASK_*`、`HX_FIX_HINTS`、`HX_TASK_PACK` |
| `--max-retries <n>` | `3` | 每任务 fast 套件失败后的自校正轮数 |
| `--limit <n>` | — | 最多处理 N 个任务后停止 |
| `--parallel <n>` | `1` | 同一 `@group=` 内最大并发任务数 |
| `--fan-out <n>` | — | 在 N 个隔离 worktree 中并行 apply+verify，选最优结果 |

```bash
hx apply add-refund --runner 'cursor-agent --task "$HX_TASK_TITLE"'
hx apply add-refund --parallel 2 --runner '<agent>'
hx apply add-refund --fan-out 3 --runner '<agent>'
```

弱 IDE（Codex/OpenCode）：`hx adapter sync --targets codex,generic` → Tier 2 自动加强门禁。

### 5.7 Verify — `hx verify` / `hx fix`

```bash
hx verify <change>
hx fix --change <change> --sensor <sensorId> [--runner <cmd>]
```

| `fix` 选项 | 必填 | 含义 |
| --- | --- | --- |
| `--change` | 是 | change id |
| `--sensor` | 是 | 失败 sensor id |
| `--runner` | 否 | 启动修复会话；设置环境变量 `HX_FIX_PACK` |

### 5.8 Archive — `hx archive` / `hx rebase check`

```bash
hx rebase check <change>
hx archive <change> [--force]
```

| 选项 | 含义 |
| --- | --- |
| `--force` | 跳过须处于 `verified` 状态的要求（仅 `lite` profile 等场景） |

---

## 6. 命令完整参考

以下按命令族列出**全部选项**。未列出的子命令无额外选项。

### 6.1 门禁与指南 — `hx gate` / `hx guide`

| 命令 | 选项 | 含义 |
| --- | --- | --- |
| `gate check <change>` | `--phase <cmd>` | 检查指定阶段；默认下一待推进阶段 |
| `gate advance <change>` | — | 推进至下一阶段（须传感器全绿 + 前置条件） |
| `gate approve <change>` | `--gate`, `--approver` | 记录人工批准（必填） |
| `gate hook-check` | — | git hook 用：对 implementing 状态 change 跑 apply 门禁 |
| `gate replay` | — | CI 回放所有活跃 change 的下一阶段的门禁 |
| `guide pack <change>` | `--phase`（必填）, `--out <file>` | 组装阶段 Context Pack |
| `guide task-pack <change> <taskId>` | `--out <file>` | 单任务交接包（默认 `tasks/<id>-pack.md`） |

### 6.2 探索与归档

| 命令 | 选项 | 含义 |
| --- | --- | --- |
| `explore <change>` | `--topic <topic>` | 只读探索笔记主题，默认 `unscoped` |
| `archive <change>` | `--force` | 合并 delta 并归档 |
| `openspec import` | `--from <dir>` | OpenSpec 目录，默认 `openspec` |

### 6.3 验证与豁免

| 命令 | 选项 | 含义 |
| --- | --- | --- |
| `verify <change>` | — | 完整验证套件 + 可追溯性 |
| `trace check [change]` | `--all` | 检查场景→测试覆盖 |
| `sync` | — | spec↔code 漂移检测 |
| `view` | `--out <file>` | HTML 仪表盘，默认 `harnessx-dashboard.html` |
| `status` | — | 活跃 change 表格 |
| `waiver add <change>` | `--target`, `--reason`, `--requested-by`, `--approved-by`（均必填）, `--expires <iso>` | 有时限豁免；`--target` 可为 sensor id、`scenario:…`、`tests:…` |
| `waiver list <change>` | — | 列出豁免及是否过期 |
| `harness lint` | — | 宪法与 Skill 冲突检测 |
| `rebase check <change>` | — | 与其他 change 的 delta 冲突预检 |
| `profile recommend <change>` | `--diff-lines <n>`, `--choose <profile>`, `--override-reason <reason>` | 推荐/记录 profile 选择 |

**豁免配置样例：**

```bash
hx waiver add add-refund \
  --target lint \
  --reason "第三方 SDK 误报，已人工确认" \
  --requested-by zhangsan \
  --approved-by lisi \
  --expires 2026-04-01T00:00:00Z
```

### 6.4 测试优先与夹具

| 命令 | 选项 | 含义 |
| --- | --- | --- |
| `testfirst generate <change>` | — | 为 strict profile 生成测试桩 |
| `testfirst approve <change>` | `--files <list>`, `--by <name>` | 哈希锁定已批准测试文件 |
| `fixture approve <file>` | `--by <name>` | 批准夹具快照 |
| `fixture verify` | — | 验证已批准夹具未被篡改 |

### 6.5 资产与 Hub

| 命令 | 选项 | 含义 |
| --- | --- | --- |
| `asset list` | `--change <id>` | 分层解析后的资产列表 |
| `asset promote <dir>` | `--to trial\|enforced\|deprecated` | 提升资产生命周期 |
| `asset backfill <dir>` | — | 从 runs 回填 metrics |
| `asset scan <dir>` | — | 指南内容注入扫描 |
| `lock write` / `lock verify` | — | 写/校验 `harness.lock` |
| `hub golden` | — | 列出内置黄金 Hub 包 |
| `hub seed [path]` | — | 创建 Hub 目录，默认 `harness-hub` |
| `hub add <id>@<ver>` | `--hub <path>`（必填） | 安装到 `.hub-cache/` |
| `hub sync` | `--hub`（必填）, `--apply`, `--force`, `--only <ids>` | 对账/三方合并上游更新 |
| `hub promote <dir>` | `--hub`, `--by`（必填）, `--evidence <ref>` | 发布本地资产到 Hub |
| `hub approve <id>@<ver>` | `--hub`, `--reviewer`（必填） | 批准 Hub 包评审 |
| `hub eval <id>@<ver>` | `--hub`（必填）, `--local <dir>`, `--golden <name>` | 发布前验收 |
| `hub search [q]` | `--hub`（必填）, `--kind`, `--phase`, `--category package\|bundle\|blueprint`, `--index` | 检索 Hub 目录 |
| `bundle list` | `--hub <path>` | 列出内置或 Hub Bundle |

**Hub 配置工作流：**

```bash
# 平台组：创建 Hub
hx hub seed ./harness-hub
cd harness-hub && git init && git add . && git commit -m "seed hub"

# 业务仓库 config.yaml
# hub: ../harness-hub

hx hub add prd-writing@1.0.0 --hub ./harness-hub
hx hub sync --hub ./harness-hub          # 查看更新
hx hub sync --hub ./harness-hub --apply  # 合并上游
hx lock write
```

### 6.6 适配器

| 命令 | 选项 | 含义 |
| --- | --- | --- |
| `adapter sync` | `--targets <list>` | 编译目标，默认 `cursor,trae,qoder,claude,generic` |
| `adapter targets` | — | 列出目标及 Tier/能力 |
| `adapter drift` | `--targets <list>` | 检测 IDE 输出文件是否被手改 |
| `adapter quest <change>` | — | 导出 Qoder Quest 规格 |

### 6.7 编排与评审（v0.2+）

| 命令 | 选项 | 含义 |
| --- | --- | --- |
| `runtime worktree <action> [change]` | `--slot`, `--path` | `create` / `list` / `remove` 隔离 worktree |
| `review import <change> <file>` | — | 导入 diff 行级评审 JSON/YAML |
| `review list <change>` | — | 列出评审标注 |
| `review resolve <change> <id>` | — | 标记标注已解决 |
| `eval guides <change>` | `--cases <file>` | 指南行为评测 |
| `notify <change>` | `--interval <ms>`, `--webhook <url>`, `--once` | 轮询变更状态；可用 `HX_WATCH_WEBHOOK` 环境变量 |

### 6.8 Steering 与 Rubric

| 命令 | 选项 | 含义 |
| --- | --- | --- |
| `steer report` | `--threshold <n>` | 失败模式聚合阈值，默认 `3` |
| `steer distill <signature>` | `--kind guide.skill\|sensor.rubric` | 从失败模式蒸馏草稿资产 |
| `steer harvest-pr` | `--from <file>` | 从 PR 评论 JSON 收获 rubric 规则 |
| `steer coverage` | `--aggregate <dir>` | 本仓或跨仓覆盖率聚合 |
| `steer publish <dir>` | `--hub`, `--by`（必填）, `--evidence`, `--skip-eval` | 指标→eval→Hub 闭环 |
| `rubric add <text>` | `--pattern <regex>`, `--severity block\|warn\|info` | 添加 AI 评审规则 |
| `rubric feedback <file> <ruleId>` | `--false-positive` | 记录误报反馈 |
| `janitor run` | — | 过期豁免、漂移、死资产扫描 |

### 6.9 触发器与 MCP

| 命令 | 选项 | 含义 |
| --- | --- | --- |
| `watch` | — | 前台守护 `trigger: file-save` 的 sensor |
| `schedule run` | — | 执行 `trigger: schedule` 的 sensor（CI cron 入口） |
| `mcp` | — | stdio MCP 服务：`gate_check`, `guide_pack`, `change_status`, `trace_check`, `apply_task`, `fix_session`, `drift_check` |

### 6.10 元数据完整性

| 命令 | 选项 | 含义 |
| --- | --- | --- |
| `meta verify [change]` | `--all` | 校验 `meta.yaml` 未被篡改 |

---

## 7. 核心心智模型

1. 行为改动在 **change 工作区**（`harnessX/changes/<id>/`），用 delta spec 描述增量。
2. **Gate**：`hx gate advance` 仅当 sensor 全绿且满足前置条件（如人工批准）；sensor 崩溃视为阻断（fail-closed）。
3. Agent 输入由 **Guide/Context Pack** 组装；输出由 **Sensor** 检验；失败带 `fix_hint`，可进 `hx fix` 回环。
4. `hx archive` 将 delta 合并进主规格。
5. 反复失败经 **Steering** 蒸馏为新 Guide，经 **Hub** 共享。

## 8. v0.3 / v0.4 / v0.5 分层架构速览

| 层级 | 能力 | 典型命令 / 配置 |
| --- | --- | --- |
| **Hub 资产层** | 包/Bundle/蓝图、search、eval、sync 合并 | `init --from-hub`、`hub search`、`imports:` |
| **HX 编排层** | Blueprint 收口、Tier 补偿、drift/UAT | `blueprint.yaml`、`drift` sensor |
| **IDE 执行层** | 适配器 + L1 契约 | `adapter sync`、`HX_TASK_*`、`hx mcp` |

enterprise profile 含 `prototype-complete`、`uat-complete`、统一 `drift` sensor。概念词表见 [glossary.md](glossary.zh-CN.md)。

## 9. 进一步阅读

- [使用场景示例（17 个）](examples/README.md)
- [概念词表](glossary.zh-CN.md)
- [包边界说明](architecture/package-boundaries.md)
- [L1 环境契约 JSON Schema](../schemas/l1/agent-env-contract.json)
- [系统设计文档](harness-delivery-system-design.html)
- 仓库根目录 [README.md](../README.md)
