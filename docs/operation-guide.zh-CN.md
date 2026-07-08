# HarnessX 操作说明

**English**: [Operation Guide (English)](operation-guide.en.md)

本文档说明如何在日常工作中使用 HarnessX（`hx` CLI）与 AI 编码 agent 协作交付软件变更。文中**凡涉及命令均列出全部选项及含义**；**凡需使用者配置的文件均给出样例与配置步骤**。

- **按主题入门**（核心概念、初始化前配置、特殊项目定制）：[`usage-guide.zh-CN.md`](usage-guide.zh-CN.md)
- **端到端场景**：[`docs/examples/`](examples/README.md)（推荐 [场景选择指南](examples/00-场景选择指南.md)）

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
| `--hub <path>` | 与 `--from-hub` 联用 | Hub 主仓来源：本地目录，或 GitHub 仓库 URL（支持私有库，建议 SSH：`git@github.com:<org>/<repo>.git`） |
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

**示例 — 一条命令 seed 后直接提交并推送到 GitHub：**

```bash
hx hub seed ./harness-hub \
  --submit \
  --remote git@github.com:your-org/hx-hub.git \
  --branch main \
  --message "seed hub packages"
```

`--submit` 未开启时，`hx hub seed` 仅写本地目录；开启后会在目标目录执行 `git init/add/commit/push`。

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

hub: ./harness-hub           # 本地 Hub 根路径；也可写 GitHub URL（如 git@github.com:org/hx-hub.git）

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

**配置步骤：** 编辑 `blueprint.yaml` 后，在已配置 `config.yaml.hub` 的仓库执行 Hub 蓝图安装流程（见场景 [16](examples/16-v0.3-hub-blueprint-init.md)），或通过 `hx init --from-hub <blueprint>@<ver> --hub <path-or-git-url>` 初始化。

### 3.4 `harnessX/constitution.md`

项目最高优先级原则（域边界、不可妥协约束）。Agent 的 Context Pack 始终包含此文件。

**配置步骤：** 初始化后立即编辑，写明核心域、禁止事项、测试/安全底线；`hx harness lint` 会检测 Skill 与宪法矛盾。

### 3.5 `harnessX/harness.lock`

由 `hx lock write` 生成，记录已解析资产的版本与内容哈希。提交到 git，CI 用 `hx lock verify` 防篡改。

---

## 4. 四阶段操作模型（本手册主轴）

> 你要求按阶段组织：**需求阶段 → 设计阶段 → 开发编码阶段 → 测试阶段**。本章及下一章按此结构展开。

### 4.1 操作入口

| 入口 | 适用场景 | 示例 |
| --- | --- | --- |
| **终端命令** | gate 推进、人工批准、归档、Hub/CI 管控 | `hx gate approve`、`hx archive` |
| **Cursor 对话框** | 写提案、写设计、写代码、自校正 | `/hx-propose`、`/hx-design`、`/hx-apply` |

经验法则：**agent 能自己完成的走 Cursor；必须人工背书的走终端**。

### 4.2 阶段总览

| 阶段 | 目标 | 关键命令 |
| --- | --- | --- |
| 需求阶段 | 明确业务变更、形成可验证规格 | `change create`、`propose`、`gate check --phase spec`、`gate approve` |
| 设计阶段 | 形成可落地技术方案 | `design`、`guide pack --phase design`、`gate advance` |
| 开发编码阶段 | 按任务实现并持续自校正 | `plan`、`apply`、`guide task-pack`、`fix` |
| 测试阶段 | 完整验证、可追溯、归档发布 | `verify`、`trace check`、`fixture verify`、`archive` |

---

## 5. 需求阶段（Requirements）

### 5.1 目标与产物

- `harnessX/changes/<id>/proposal.md`
- `harnessX/changes/<id>/specs/**`（delta spec）
- `meta.yaml` 中的状态与审批记录

### 5.2 推荐流程

```bash
hx change create add-refund --domains orders,payments
hx propose add-refund --title "支持部分退款"
hx gate check add-refund --phase spec
hx gate approve add-refund --gate spec --approver zhangsan
hx gate advance add-refund
```

### 5.3 本阶段命令与全部选项

| 命令 | 选项 | 含义 |
| --- | --- | --- |
| `change create <id>` | `--domains <list>` | 触及域列表（逗号分隔） |
|  | `--profile <name>` | 覆盖默认 profile |
|  | `--from-issue <url>` | 从 GitHub issue 脚手架（可推断域） |
| `change list` | — | 查看活跃 change |
| `propose <change>` | `--title <title>` | proposal 标题（默认 `Untitled`） |
| `gate check <change>` | `--phase <cmd>` | 检查指定阶段（不填则默认下一阶段） |
| `gate approve <change>` | `--gate <gate>` | 必填，通常 `spec` |
|  | `--approver <name>` | 必填，审批人 |
| `gate advance <change>` | — | 在当前阶段全绿时推进 |

### 5.4 需求阶段配置建议

1. `config.yaml`：确保 `profile` 与团队风险等级一致（`standard` / `strict` / `enterprise`）。
2. `harness.yaml`：确保 `spec` 阶段套件存在（如 `fast`）。
3. 高合规团队建议启用：

```yaml
compensation:
  enabled: true
  escalate_warn_to_block: true
```

---

## 6. 设计阶段（Design）

### 6.1 目标与产物

- `design.md` 或 `design/overview.md`
-（enterprise）`design/ui/pages.md`、LLD 文件
- 设计阶段 gate 记录（如 prototype-complete）

### 6.2 推荐流程

```bash
hx design add-refund
hx guide pack add-refund --phase design --out /tmp/design-pack.md
hx gate check add-refund --phase design
hx gate advance add-refund
```

### 6.3 本阶段命令与全部选项

| 命令 | 选项 | 含义 |
| --- | --- | --- |
| `design <change>` | — | 先检查 design gate，再生成设计脚手架 |
| `guide pack <change>` | `--phase <cmd>` | 必填，通常 `design` |
|  | `--out <file>` | 输出到文件 |
| `gate check <change>` | `--phase design` | 检查设计阶段套件 |
| `gate advance <change>` | — | 设计阶段通过后推进 |

### 6.4 设计阶段配置建议

- 在 `blueprint.yaml` 中声明 design 所需 guides/sensors，自动收口到 `harness.yaml`：

```yaml
phases:
  design:
    guides: [prototype-wireframe]
```

- 若团队有统一设计模板，将其注册为 `guide.template` 并在 `guides` 中绑定 `phase: [design]`。

---

## 7. 开发编码阶段（Implementation）

### 7.1 目标与产物

- `tasks.md`（双轨 test/impl）
- 每任务 task-pack（`tasks/<taskId>-pack.md`）
- 代码实现与 apply 阶段 gate 记录

### 7.2 推荐流程

```bash
hx plan add-refund
hx apply add-refund --runner "<agent-cmd>"
hx guide task-pack add-refund 01b
```

### 7.3 本阶段命令与全部选项

| 命令 | 选项 | 含义 |
| --- | --- | --- |
| `plan <change>` | — | 从 delta spec 生成双轨任务 |
| `apply <change>` | `--runner <cmd>` | 每任务执行命令；注入 `HX_TASK_*` / `HX_FIX_HINTS` / `HX_TASK_PACK` |
|  | `--max-retries <n>` | 失败后自校正重试次数（默认 `3`） |
|  | `--limit <n>` | 最多处理 N 个任务 |
|  | `--parallel <n>` | 同一并行组并发数（默认 `1`） |
|  | `--fan-out <n>` | N 个 worktree 并行执行，选最优结果 |
| `guide task-pack <change> <taskId>` | `--out <file>` | 输出任务交接包 |
| `fix` | `--change <id>` | 必填，change id |
|  | `--sensor <id>` | 必填，失败 sensor |
|  | `--runner <cmd>` | 可选，带 `HX_FIX_PACK` 拉起修复会话 |
| `runtime worktree <action> [change]` | `--slot <id>` / `--path <path>` | v0.2 隔离执行 |

### 7.4 编码阶段配置建议

- 无 Cursor / 弱 IDE（Codex/OpenCode）建议：

```bash
hx adapter sync --targets codex,generic
```

- 对应 `config.yaml` 可设：

```yaml
adapter:
  target: codex
compensation:
  enabled: true
```

---

## 8. 测试阶段（Testing & Verification）

### 8.1 目标与产物

- verify 套件全绿
- 场景→测试可追溯
- fixture / meta 完整性校验
- 归档后的主规格更新

### 8.2 推荐流程

```bash
hx verify add-refund
hx trace check add-refund
hx fixture verify
hx rebase check add-refund
hx archive add-refund
```

### 8.3 本阶段命令与全部选项

| 命令 | 选项 | 含义 |
| --- | --- | --- |
| `verify <change>` | — | 跑完整验证套件与状态推进 |
| `trace check [change]` | `--all` | 检查可追溯覆盖 |
| `sync` | — | spec↔code 漂移检测 |
| `fixture approve <file>` | `--by <name>` | 批准 fixture 快照 |
| `fixture verify` | — | 校验批准 fixture 未漂移 |
| `testfirst generate <change>` | — | strict 测试桩生成 |
| `testfirst approve <change>` | `--files <list>`, `--by <name>` | 批准测试基线 |
| `waiver add <change>` | `--target <target>` | 必填（sensor / `scenario:` / `tests:`） |
|  | `--reason <reason>` | 必填，豁免原因 |
|  | `--requested-by <name>` | 必填，申请人 |
|  | `--approved-by <name>` | 必填，批准人 |
|  | `--expires <iso>` | 过期时间（默认 +14 天） |
| `waiver list <change>` | — | 查看豁免与过期状态 |
| `archive <change>` | `--force` | 跳过 verified 要求（谨慎） |
| `rebase check <change>` | — | 归档前冲突预检 |
| `meta verify [change]` | `--all` | 防篡改校验 |

### 8.4 测试阶段配置样例

常见豁免（有时限）：

```bash
hx waiver add add-refund \
  --target lint \
  --reason "第三方 SDK 误报，已人工确认" \
  --requested-by zhangsan \
  --approved-by lisi \
  --expires 2026-04-01T00:00:00Z
```

CI 侧建议固定执行：

```bash
hx gate replay
hx trace check --all
hx fixture verify
hx meta verify --all
```

---

## 9. 跨阶段平台能力（可选但推荐）

### 9.1 Hub 资产管理命令（本次升级新增）

当你把 Hub 作为组织级资产仓时，建议使用以下命令完成生命周期、评审、策略与完整性治理。

#### `hx hub sync`

```bash
hx hub sync --hub <path-or-git-url> [--apply] [--force] [--only <ids>] [--offline] [--refresh]
```

| 选项 | 必填 | 含义 |
| --- | --- | --- |
| `--hub <path>` | 是 | Hub 来源（本地路径或 GitHub URL） |
| `--apply` | 否 | 将上游变更应用到本地 `.hub-cache` |
| `--force` | 否 | 有冲突也继续写入（带冲突标记） |
| `--only <ids>` | 否 | 仅同步这些包 id（逗号分隔） |
| `--offline` | 否 | 离线模式，不拉远端，仅用本地镜像缓存 |
| `--refresh` | 否 | 同步前强制刷新远端镜像 |

#### `hx hub promote`

```bash
hx hub promote <dir> --hub <path-or-git-url> --by <name> [--evidence <ref>] [--skip-policy]
```

| 选项 | 必填 | 含义 |
| --- | --- | --- |
| `--hub <path>` | 是 | Hub 来源 |
| `--by <name>` | 是 | 发布人（写入评审元数据） |
| `--evidence <ref>` | 否 | 价值/评估证据引用（报告链接、CI run 等） |
| `--skip-policy` | 否 | 跳过发布前 `hub policy check`（不建议） |

#### `hx hub eval`

```bash
hx hub eval <id@version> --hub <path-or-git-url> [--local <dir>] [--golden <name>] [--out <file>]
```

| 选项 | 必填 | 含义 |
| --- | --- | --- |
| `--hub <path>` | 是 | Hub 来源 |
| `--local <dir>` | 否 | 评估本地资产目录（不走 hub package） |
| `--golden <name>` | 否 | 评估 `hub/evals/golden-repos/<name>` 检查集 |
| `--out <file>` | 否 | 输出结构化 JSON 报告 |

#### `hx hub search` 与 catalog

```bash
hx hub search [query] --hub <path-or-git-url> [--kind <kind>] [--phase <phase>] [--category <cat>] [--index]
hx hub catalog rebuild --hub <path-or-git-url>
```

| 选项 | 必填 | 含义 |
| --- | --- | --- |
| `query` | 否 | 按 id/version/kind/description 模糊匹配 |
| `--hub <path>` | 是 | Hub 来源 |
| `--kind <kind>` | 否 | 按资产类型过滤（如 `guide.skill`） |
| `--phase <phase>` | 否 | 按阶段过滤（`propose/design/apply/verify` 等） |
| `--category <cat>` | 否 | `package` \| `bundle` \| `blueprint` |
| `--index` | 否 | 重建 `index.json` 后退出 |

#### `hx hub asset`

```bash
hx hub asset info <id@version> --hub <path-or-git-url>
hx hub asset promote <id@version> --hub <path-or-git-url> --to <status>
hx hub asset deprecate <id@version> --hub <path-or-git-url> --reason <text>
```

| 子命令 | 选项 | 含义 |
| --- | --- | --- |
| `asset info` | `--hub` | 输出分类/元数据/评审状态（JSON） |
| `asset promote` | `--hub`, `--to <status>` | 变更生命周期状态（`draft/trial/enforced/deprecated/archived`） |
| `asset deprecate` | `--hub`, `--reason <text>` | 标记废弃并记录原因 |

#### `hx hub review`

```bash
hx hub review request <id@version> --hub <path-or-git-url> --by <name>
hx hub review approve <id@version> --hub <path-or-git-url> --reviewer <name>
hx hub review reject <id@version> --hub <path-or-git-url> --reviewer <name> --reason <text>
```

| 子命令 | 选项 | 含义 |
| --- | --- | --- |
| `review request` | `--hub`, `--by` | 创建/重置待评审请求 |
| `review approve` | `--hub`, `--reviewer` | 通过评审 |
| `review reject` | `--hub`, `--reviewer`, `--reason` | 拒绝并记录原因 |

#### `hx hub policy` 与缓存治理

```bash
hx hub policy check --hub <path-or-git-url> [--strict]
hx hub cache gc [--older-than-days <n>]
```

| 命令 | 选项 | 含义 |
| --- | --- | --- |
| `policy check` | `--hub` | 运行治理策略校验（审批/owner/hash 等） |
|  | `--strict` | 将 warning 也视为失败（默认仅 error 失败） |
| `cache gc` | `--older-than-days <n>` | 清理过期远端镜像缓存（默认 `30` 天） |

#### 端到端示例：发布 -> 评审 -> enforce -> 检索 -> 校验

```bash
# 1) 将本地资产发布到 Hub，并附带证据
hx hub promote ./harnessX/assets/guides/secure-api \
  --hub git@github.com:your-org/hx-hub.git \
  --by zhangsan \
  --evidence "ci://runs/1820"

# 2) 发起并通过评审
hx hub review request secure-api@1.2.0 --hub git@github.com:your-org/hx-hub.git --by zhangsan
hx hub review approve secure-api@1.2.0 --hub git@github.com:your-org/hx-hub.git --reviewer lisi

# 3) 生命周期推进到 enforced
hx hub asset promote secure-api@1.2.0 --hub git@github.com:your-org/hx-hub.git --to enforced

# 4) 策略检查 + 评估报告
hx hub policy check --hub git@github.com:your-org/hx-hub.git --strict
hx hub eval secure-api@1.2.0 --hub git@github.com:your-org/hx-hub.git --out /tmp/secure-api-eval.json

# 5) 检索/重建索引/缓存回收
hx hub search secure --hub git@github.com:your-org/hx-hub.git --kind guide.skill --phase apply
hx hub catalog rebuild --hub git@github.com:your-org/hx-hub.git
hx hub cache gc --older-than-days 14
```

| 能力 | 关键命令 | 用途 |
| --- | --- | --- |
| Hub 资产治理 | `hub seed/add/sync/promote/eval/search/catalog/asset/review/policy/cache` | 组织级资产分发与回收 |
| Steering 质量闭环 | `steer report/distill/publish` | 从失败中沉淀新规则 |
| 仪表盘与覆盖聚合 | `view` / `steer coverage --aggregate` | 项目与组织视角治理 |
| MCP 工具桥接 | `mcp` | 给 IDE/Agent 暴露 `apply_task`、`fix_session` 等工具 |

---

## 10. 核心心智模型

1. 行为改动在 **change 工作区**（`harnessX/changes/<id>/`），用 delta spec 描述增量。
2. **Gate**：`hx gate advance` 仅当 sensor 全绿且满足前置条件（如人工批准）；sensor 崩溃视为阻断（fail-closed）。
3. Agent 输入由 **Guide/Context Pack** 组装；输出由 **Sensor** 检验；失败带 `fix_hint`，可进 `hx fix` 回环。
4. `hx archive` 将 delta 合并进主规格。
5. 反复失败经 **Steering** 蒸馏为新 Guide，经 **Hub** 共享。

## 11. v0.3 / v0.4 / v0.5 分层架构速览

| 层级 | 能力 | 典型命令 / 配置 |
| --- | --- | --- |
| **Hub 资产层** | 包/Bundle/蓝图、search、eval、sync 合并 | `init --from-hub`、`hub search`、`imports:` |
| **HX 编排层** | Blueprint 收口、Tier 补偿、drift/UAT | `blueprint.yaml`、`drift` sensor |
| **IDE 执行层** | 适配器 + L1 契约 | `adapter sync`、`HX_TASK_*`、`hx mcp` |

enterprise profile 含 `prototype-complete`、`uat-complete`、统一 `drift` sensor。概念词表见 [glossary.md](glossary.zh-CN.md)。

## 12. 进一步阅读

- [使用说明（按主题）](usage-guide.zh-CN.md)
- [使用场景示例（18 个，按旅程组织）](examples/README.md)
- [概念词表](glossary.zh-CN.md)
- [包边界说明](architecture/package-boundaries.md)
- [L1 环境契约 JSON Schema](../schemas/l1/agent-env-contract.json)
- [系统设计文档](harness-delivery-system-design.html)
- 仓库根目录 [README.md](../README.md)
