# hxhub 使用手册

**适用角色**：平台 / 效能工程师、Hub 维护者、资产作者  
**产品版本**：hx-lite v0.1+（Profile → Stage → Task 模型）  
**配套**：业务交付见 [企业 AI 交付全过程手册](enterprise-delivery.zh-CN.md)

---

## 1. 定位

| CLI | 职责 |
| --- | --- |
| `hxhub` | Hub 运维：种子化、资产创建/发布、评审、诊断 |
| `hx` / `hx hub …` | 项目交付；兼容部分 Hub 子命令 |

**Harness Hub** 是组织级 Guide / Sensor 资产仓库（通常独立 Git 仓库）。业务项目 **Owner** 用 `hx project create --profile … --hub …` 按 Profile 拉取相关 stage.task 资产写入业务仓库；**成员** `git pull`（或 clone）后用 `hx init --stages …` 选择本地激活阶段。后续资产更新：Owner `hx project sync-hub`，成员 `hx project pull-assets`。

> Bundle / Blueprint 已移除。路径差异由资产 `asset.yaml` 的 `stage` / `task` 与 Profile 表达。

---

## 2. 核心概念

### 2.1 资产与归属

每个可发布单元是带 `asset.yaml` 的目录：

```yaml
id: clock-safety
kind: guide.skill          # 见下表
version: 1.0.0
status: draft              # draft → trial → enforced → deprecated
execution: inferential     # guide：computational | inferential
stage: dev                 # 必填：req | arch | dev | test
task: apply                # 可选；省略则对该 stage 全部 task 生效
```

| kind | 主文件 | 用途 |
| --- | --- | --- |
| `guide.skill` | `SKILL.md` | Agent 规范 / 写作技能 |
| `guide.template` | `template.md` | 脚手架模版 |
| `guide.workflow` | `assets/workflows/<stage>/<task>.md` | 任务壳正文（作业清单） |
| `guide.command` | `*.md`（可选） | 覆盖 workflow 的自定义斜杠命令壳 |
| `guide.constraint` | `*.yaml` | 硬约束 |
| `sensor.rubric` | `rules.yaml` | AI Review 规则集 |
| `sensor.*` | 按类型 | 脚本 / 规则等反馈资产 |

**解析优先级**（高→低）：`change` > `local` > `team` > `hub` > `builtin`

### 2.2 信任模型

| 关卡 | 机制 |
| --- | --- |
| 版本不可变 | 同一 `id@version` 不可重复发布 |
| 发布评审 | `.review` 侧车：`pending` → `approved` / `rejected` |
| 注入扫描 | `hx asset scan`（promote / submit 前） |
| 消费锁定 | 业务仓 `hx lock write` + CI `hx lock verify` |

### 2.3 双角色

```yaml
# 业务项目（消费）
hub:
  source: git@github.com:your-org/hx-hub.git
  role: consumer
  actor: wang.dev

# 平台运维仓
hub:
  source: git@github.com:your-org/hx-hub.git
  role: maintainer
  actor: zhao.platform
```

| 角色 | 典型能力 |
| --- | --- |
| `consumer` | 检索、安装、同步；`hxhub submit` → `contributions/` |
| `maintainer` | `promote`、`review`、`contributions accept`、`push`、`push-github`、策略检查 |

Hub 根目录 `hub-policy.yaml` 管维护者白名单与安装策略。已配置 `hub` 时多数命令可不传 `--hub`。

### 2.4 仓库结构

```text
harness-hub/
├── hub-policy.yaml
├── packages/guide|sensor/<kind>/<id>/<ver>/
│   ├── asset.yaml
│   ├── SKILL.md | template.md | …
│   └── .review
├── contributions/          # consumer 贡献队列
└── evals/                  # 可选黄金评测
```

按 Profile 预览将解析到的资产：

```bash
hxhub resolve --profile enterprise --hub ./harness-hub
```

---

## 3. 快速开始

### 3.1 种子化组织 Hub

```bash
# 从内置 golden 生成本地 Hub（可按 profile / scenario 裁剪）
hxhub seed ./harness-hub --profile enterprise --scenario core

# 推到 GitHub（二选一）

# 方式 A：种子化与推送一步完成
hxhub seed ./harness-hub --profile enterprise --scenario core \
  --submit --remote git@github.com:your-org/hx-hub.git

# 方式 B：先本地生成，再单独推送（推荐审查后再推）
hxhub seed ./harness-hub --profile enterprise --scenario core
hxhub push-github ./harness-hub \
  --remote git@github.com:your-org/hx-hub.git \
  --branch main \
  --message "feat: seed enterprise hub"
# 若远程已有提交，默认会 fetch + rebase 后再 push；可用 --integrate merge|none
```

`push-github` 会：若目录尚无 Git 则 `git init` → 配置 `origin`（首次须 `--remote`）→ 提交变更 → **fetch 并 rebase/merge 远程提交** → `git push -u origin <branch>`。  
业务仓等价命令：`hx hub push-github …`（与 `hxhub push-github` 相同）。

> **与 `hxhub push` 的区别**：`push` 面向**已 clone / 已配置 origin** 的 maintainer 运维仓（改 packages 后 commit+push）；`push-github` 面向**本地新生成的 Hub 目录**（如 `seed` 产出），可自动 init 与添加 remote，并在远程领先时自动整合历史。

### 3.2 初始化运维工作区

```bash
hxhub init . --hub git@github.com:your-org/hx-hub.git --actor zhao.platform
hxhub doctor --fix-hints
hxhub catalog                 # 默认 list：列出 Hub 资产
# hxhub catalog rebuild     # 重建 index.json（可选）
```

`hxhub init` **不会**创建 `changes/` 等交付目录（与业务仓 `hx project create` / `hx init` 不同）。

### 3.3 业务项目消费 Hub

```bash
# Owner：按 profile 拉取 stage.task 资产进业务仓
hx project create --profile enterprise --hub git@github.com:your-org/hx-hub.git \
  --adapter cursor --actor li.lead

hx hooks install && hx adapter sync
git add harnessX && git commit && git push

# 成员：选本地激活阶段
git pull
hx init --stages req,dev
hx adapter sync
```

Owner 从组织 Hub 升级已入库资产（含落地到 `assets/` + harness + lock）：

```bash
hx project sync-hub                  # 默认同步并落地；可选 --adapter-sync
# 或：hx project sync-hub --commit --push
# 通知成员：
#   hx project pull-assets --adapter-sync
```

单包安装后也建议走同一落地命令（`hxhub add` / `hx hub add` 只写 `.hub-cache`，**不会**自动写入 `harness.yaml`）：

```bash
hxhub add prd-writing@1.0.0
# 或：hx hub add business-insight@0.1.0
hx harness lint --completeness   # 应出现 hub_cache_unregistered 警告
hx project sync-hub --no-apply   # land cache → assets + harness.yaml + lock
hx harness lint --completeness   # 警告消失后即可 adapter sync
hx lock verify
```

完整性校验说明：

- `hx project create` / `hx project sync-hub` 结束后会自动做 harness 完整性检查（error 级失败会阻断）。
- Profile 解析会包含 `profiles.*.suites` 中的可选任务（如 `req.biz-understanding`），避免 Hub 上绑定到可选任务的 skill 被静默遗漏。
- `hx harness lint --completeness` 可随时复查；`--strict` 将 warn 视为失败。

成员只更新项目仓资产（不覆盖 `changes/` / `docs/` / 业务代码）：

```bash
hx project pull-assets --check       # 预览
hx project pull-assets --adapter-sync
```

---

## 4. 资产创建与发布

### 4.1 流程

```text
asset create → 编辑正文 → asset scan → 本地 draft→trial
  → promote/submit → review approve →（可选）enforced → push
  → 业务仓 add / project create 消费
```

### 4.2 创建脚手架

```bash
hxhub asset create \
  --kind guide.skill \
  --id clock-safety \
  --asset-version 1.0.0 \
  --status draft \
  --stage dev \
  --task apply \
  --out ./assets/clock-safety

# 或从已有目录 / GitHub skill 导入
hxhub asset create --kind guide.skill --id my-skill \
  --from-github https://github.com/org/skills --path my-skill \
  --stage req --task prd-writing --out ./assets/my-skill

hxhub asset create --interactive
```

`stage` 必填；写 `task` 则只在对应 Context Pack / Gate 注入，省略则该 stage 全 task 可见（噪音更大）。

### 4.3 本地校验与状态

```bash
hx asset scan ./assets/clock-safety
hx asset backfill ./assets/clock-safety          # 可选 metrics
hx asset promote ./assets/clock-safety --to trial  # draft 不能直接 promote 到 Hub
```

| 状态 | 含义 |
| --- | --- |
| `draft` | 仅本地 |
| `trial` | 试用，可进 Hub |
| `enforced` | 组织强制（通常要求 `.review` approved） |
| `deprecated` | 不建议新装 |

**不可跳级**：`draft` → `trial` → `enforced`。

本地改 `asset.yaml`：`hx asset promote <dir> --to …`  
Hub 已入库：`hxhub asset promote <id>@<ver> --to …`

### 4.4 发布与评审

```bash
# maintainer：写入 packages/
hxhub promote ./assets/clock-safety --hub ./harness-hub

# consumer：写入 contributions/，等平台审核
hxhub submit ./assets/clock-safety --actor wang.dev

hxhub review approve clock-safety@1.0.0 --reviewer zhao.platform
hxhub asset promote clock-safety@1.0.0 --to enforced
hxhub push --message "feat: clock-safety 1.0.0"
# 本地新 Hub 首次推 GitHub：hxhub push-github ./harness-hub --remote git@github.com:your-org/hx-hub.git
```

贡献队列：

```bash
hxhub contributions list --status pending
hxhub contributions show <ref>
hxhub contributions accept <ref>   # 或 reject
```

同一 `id@version` 只能发布一次；升级须升 `version` 后重新发布。

### 4.5 评测、检索与目录（可选）

```bash
hxhub eval --golden <name>
hxhub eval --local ./assets/clock-safety
hxhub policy check --strict

# 浏览 / 检索资产目录（默认读 config.yaml hub；也可用 --hub <path>）
hxhub catalog                              # 等价于 catalog list
hxhub catalog --kind guide.skill --phase dev
hxhub search skill --kind guide.skill      # 带关键字检索
hxhub catalog rebuild                      # 写出可检索 index.json
# 或：hxhub search --index
```

---

## 5. 日常运维速查

| 场景 | 命令 |
| --- | --- |
| 健康检查 | `hxhub doctor --fix-hints` |
| 本地 Hub 推 GitHub | `hxhub push-github ./harness-hub --remote git@github.com:org/hx-hub.git` |
| 修复常见问题 | `hxhub fix` |
| 资产建议 | `hxhub help` |
| Profile 解析预览 | `hxhub resolve --profile standard` |
| 清理远程缓存 | `hxhub cache-gc` |
| 列出资产目录 | `hxhub catalog`（默认 `list`）/ `hxhub search [query]` |
| 重建目录索引 | `hxhub catalog rebuild` 或 `hxhub search --index` |

Steering 闭环（业务仓失败沉淀 → Hub）：见交付手册「技术经理」章；资产侧仍用本节 `promote` / `review`。

---

## 6. 与业务交付的边界

| 在 Hub 做 | 在业务仓做 |
| --- | --- |
| 种子化、版本化 Guide/Sensor | `hx project create` / `hx init --stages` |
| 评审、策略、推远程 | Owner：`hx project sync-hub`；成员：`hx project pull-assets` |
| `resolve --profile` 看装配面 | Adapter sync、hooks、lock、CI |

`hx adapter sync` 会按 `harness.yaml` 里各 task 绑定的 `guide.skill` / `guide.template` **自动组装任务壳**（Context Pack 加载步骤、绑定清单；多个 Skill/Template 时要求 Agent 自选并先向用户确认）。支持 slash command 的 IDE（Cursor / Claude / Qoder）落盘为 `/hx-<stage>-<task>`；不支持 command 的 IDE（generic / Codex / OpenCode / Trae）则将同一壳安装为任务入口 skill（或 inline 进 `AGENTS.md` / rules）。手改 IDE 生成物会被下次 sync 覆盖；改绑定只需改 `assets/workflows/`、资产或 `harness.yaml` 后重新 sync。

在 Cursor 项目中，`hx adapter sync` 生成的 hooks 还会在 Agent 回合结束后自动触发 `hx gate check`（通过 `stop` hook），Gate 失败会以 followup message 回注到 IDE 供 Agent 迭代修复（默认最多 3 轮）；若为审批类/缺输入阻塞，Agent 应停止并提示人工处理。

权威阶段定义：[delivery-stages.zh-CN.md](delivery-stages.zh-CN.md) · 术语：[glossary.zh-CN.md](glossary.zh-CN.md) · 示例仓：[packages/hub-golden](../packages/hub-golden/README.md)

---

## 7. 命令速查

```text
hxhub init | seed | resolve | doctor | fix | help | search
hxhub catalog [list|rebuild]     # 默认 list；rebuild 写 index.json
hxhub asset create | info | promote | deprecate
hxhub promote | submit | push | push-github | add | sync | eval
hxhub review request|approve|reject
hxhub contributions list|show|accept|reject
hxhub policy check | cache-gc

# 业务仓（Owner / 成员）
hx project sync-hub [--commit --push] [--adapter-sync]
hx project pull-assets [--check] [--adapter-sync]
```

等价入口：`hx hub <同名子命令>`（业务仓上下文；`hx hub catalog` 行为与上相同）。
