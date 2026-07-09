# Harness Hub 资产维护手册

**适用角色**：总架构师、平台组 Hub 维护者、资产作者、业务仓库负责人  
**版本**：HarnessX v0.4+  
**关联场景**：[08 Hub 资产共享与供应链](examples/08-hub-资产共享与供应链.md) · [16 Hub 蓝图初始化](examples/16-v0.3-hub-blueprint-init.md) · [17 平台治理与仪表盘](examples/17-v0.4-平台治理与仪表盘.md) · [21 Hub 双角色与贡献审核](examples/21-hub-双角色与贡献审核.md)

---

## 1. 概述

**Harness Hub** 是组织级资产仓库（通常是一个 Git 仓库），用于分发 **Guide（前馈）**、**Sensor（反馈）**、**拓扑 Bundle** 与 **交付蓝图**。业务仓库通过 `config.yaml` 的 `hub:` 字段引用 Hub，将资产安装到 `harnessX/.hub-cache/`，并用 `harness.lock` 锁定内容哈希。

Hub 的信任模型（四道关卡）：

| 关卡 | 机制 |
| --- | --- |
| 版本不可变 | 同一 `id@version` 不可重复发布 |
| 发布评审 | `.review` 侧车文件，`hx hub approve` |
| 双向注入扫描 | `hx asset scan` / `hx hub add` / `hx hub promote` |
| 消费端锁定 | `hx lock write` + CI `hx lock verify` |

**资产解析优先级**（高 → 低）：`change` > `local` > `team` > `hub` > `builtin`

### 1.1 双角色连接（运维 / 使用）

项目通过 `config.yaml` 声明连接同一 Hub 时的角色：

```yaml
# 使用角色（业务开发项目）
hub:
  source: git@github.com:your-org/hx-hub.git
  role: consumer
  actor: wang.dev

# 运维角色（平台管理项目）
hub:
  source: git@github.com:your-org/hx-hub.git
  role: maintainer
  actor: zhao.platform
  branch: main   # 可选
```

| 角色 | 能力 |
| --- | --- |
| `consumer` | 检索、安装、同步；`hx hub submit` 提交到 `contributions/` |
| `maintainer` | 正式发布 `hx hub promote`、审核 `hx hub contributions accept`、策略检查、`hx hub push` |

配置 `hub` 后，多数 `hx hub *` 命令**无需再传 `--hub`**。Hub 仓库根目录的 `hub-policy.yaml` 定义维护者白名单与 `installRequiresApproval` 等策略。

---

## 2. Hub 仓库目录结构

```
harness-hub/
├── hub-policy.yaml              # 维护者白名单与消费策略
├── packages/                    # 可复用单包（Skill、模版、Rubric …）
│   └── <asset-id>/
│       └── <version>/
│           ├── asset.yaml       # 必填：清单与元数据
│           ├── SKILL.md | template.md | rules.yaml | …
│           └── .review          # 评审侧车（pending | approved | rejected）
├── bundles/                     # 拓扑 Bundle（整仓 harness 片段）
│   └── <bundle-id>/
│       └── <version>/
│           ├── asset.yaml
│           ├── bundle.yaml      # guides + sensors + suites 组合
│           └── assets/          # bundle 自带资产文件
├── blueprints/                  # 交付蓝图（profile + hub_deps + 阶段资产）
│   └── <blueprint-id>/
│       └── <version>/
│           ├── asset.yaml
│           └── blueprint.yaml
├── contributions/               # 使用角色提交、待运维审核的资产
│   └── <actor>/
│       └── <asset-id>/<version>/
├── evals/                       # 可选：golden-repo 验收集
│   └── golden-repos/
│       └── <name>/
│           └── checks.yaml
└── index.json                   # 可选：由 hx hub search --index 生成
```

**远程引用**：`--hub` 可为本地路径或 Git URL（如 `git@github.com:your-org/hx-hub.git`）。首次克隆缓存于业务仓库 `harnessX/.hub-remotes/<hash>/repo`。

---

## 3. 资产类型全景

### 3.1 Package（`packages/`）

单包资产，通过 `hx hub add <id>@<ver>` 安装到 `.hub-cache/`。

| kind | 类别 | 典型文件 | 用途 |
| --- | --- | --- | --- |
| `guide.skill` | Guide · 推断型 | `SKILL.md` | Agent 写作/编码规范（如 PRD 蒸馏、API 设计） |
| `guide.template` | Guide · 计算型 | `template.md` | 脚手架模版（UAT 清单、调研报告） |
| `sensor.rubric` | Sensor · 推断型 | `rules.yaml` | 评审 Rubric 规则集 |
| `guide.constraint` | Guide · 计算型 | `*.yaml` | 架构分层等硬约束（多在 Bundle 内） |
| `guide.command` | Guide · 推断型 | `*.md` | 斜杠命令说明（多在 Bundle / base 内） |

### 3.2 Bundle（`bundles/`）

拓扑 Bundle，`kind: harness.bundle`。包含一组 **guides + sensors + suites**，用于 `hx init --bundle` 或 `hx init --from-hub api-service@1.0.0`。

### 3.3 Blueprint（`blueprints/`）

交付蓝图，`kind: harness.blueprint`。定义 `extends` profile、`hub_deps` 与阶段级 guides/sensors，用于 `hx init --from-hub enterprise-sdlc@1.0.0`。

### 3.4 Eval（`evals/`）

Golden 仓库检查集，供 `hx hub eval --golden <name>` 验证 Hub 包在代表性项目上的表现。

---

## 4. 内置 Golden 资产清单（`hx hub seed` 来源）

执行 `hx hub seed ./harness-hub` 后，以下资产写入 Hub 且 **`.review` 已为 approved**，可立即消费。

### 4.1 Packages

| ID | 版本 | kind | 阶段 | 说明 | 维护要点 |
| --- | --- | --- | --- | --- | --- |
| `api-conventions` | 1.0.0 | guide.skill | design, apply | REST 错误体、命名等 API 约定 | 修改 `SKILL.md`；semver 升级 |
| `common-review-rubrics` | 1.0.0 | sensor.rubric | verify | 通用 inferential 评审规则 | 维护 `rules.yaml` 中 trial/enforced 规则 |
| `prd-writing` | 1.0.0 | guide.skill | propose, spec | PRD → change 需求蒸馏指引 | 与 `prd-template` 配合 |
| `prd-authoring` | 1.0.0 | guide.skill | prd | 组织级 PRD 编写（Pre-phase） | 场景 19 |
| `arch-authoring` | 1.0.0 | guide.skill | arch | 全局 HLD 编写指引 | 场景 19 |
| `requirements-research-outline` | 1.0.0 | guide.skill | explore | 调研提纲（干系人、问题、指标） | enterprise 蓝图 explore 阶段 |
| `prototype-wireframe` | 1.0.0 | guide.skill | design | 低保真线框与原型指引 | `prototype-complete` sensor |
| `uat-checklist` | 1.0.0 | guide.template | verify | UAT 签收清单模版 | 复制到 `change/uat-checklist.md` |

### 4.2 Bundles（Hub Golden）

| ID | 版本 | 说明 | 内含能力（摘要） |
| --- | --- | --- | --- |
| `api-service` | 1.0.0 | 后端 API 分层拓扑 | `api-design`、`layering-rules`、`arch-boundary`、`perf-budget`、`integration-smoke` |
| `frontend-2c` | 1.0.0 | C 端网站拓扑 | `web-2c-architecture`、分层约束、性能预算 |

### 4.3 Blueprints（Hub Golden）

| ID | 版本 | extends | hub_deps（摘要） | 用途 |
| --- | --- | --- | --- | --- |
| `enterprise-delivery` | 1.0.0 | enterprise | prd-writing、prototype-wireframe、uat-checklist、arch-authoring … | 企业交付全路径 |
| `enterprise-sdlc` | 1.0.0 | enterprise-sdlc | 同上 + 工单流程 profile | 企业 SDLC 工单驱动交付 |

查看完整列表：

```bash
hx hub golden
```

---

## 5. 内置拓扑 Bundle 清单（`hx bundle list`，可发布到 Hub）

这些 Bundle 随 HarnessX 发行。发布到 Hub 时，`asset.yaml` 中 `kind: harness.bundle`，`hx hub promote` 会写入 `bundles/<id>/<version>/`（运维角色）。

| Bundle ID | 说明 | 典型项目 |
| --- | --- | --- |
| `api-service` | 后端 API 分层 + 性能预算 | Node/Go/Java REST 服务 |
| `api-service-cn` | 同上（中文资产） | 中文团队 API 项目 |
| `frontend-2c` | C 端站点 SEO/LCP | 官网、会员门户 |
| `frontend-dashboard` | B 端后台页面/组件分层 | 运营后台 |
| `library-sdk` | 可发布 SDK | npm/pypi SDK |
| `serverless-function` | 无服务器函数 | Lambda/Cloud Functions |
| `event-consumer` | 消息/事件消费者 | Kafka/SQS 消费者 |
| `event-consumer-cn` | 同上（中文） | 中文事件消费项目 |
| `data-pipeline` | 数据管道 ETL/批流 | Spark/Flink 作业 |
| `mobile-app` | 移动端分层与离线 | iOS/Android |

```bash
hx bundle list                    # 内置
hx bundle list --hub <hub-path>   # Hub 已发布
```

---

## 6. 项目内资产（非 Hub，但需一并维护）

以下资产在 `hx init` 时写入业务仓库 `harnessX/assets/`，**不**在 Hub 中，但与 Hub 资产协同：

### 6.1 Base Bundle 自带 Guides（builtin）

| ID | kind | 阶段 | 说明 |
| --- | --- | --- | --- |
| `proposal-template` | guide.template | propose | 提案模版 |
| `requirements-template` | guide.template | propose | 需求蒸馏模版 |
| `design-template` | guide.template | design | HLD/LLD 设计模版 |
| `prd-template` | guide.template | prd | 组织 PRD 模版 |
| `arch-hld-template` | guide.template | arch | 全局概要设计模版 |
| `arch-lld-template` | guide.template | arch-lld | 模块详细设计模版 |
| `prd-writing` / `spec-writing` / `coding-conventions` 等 | guide.skill | 各阶段 | 内置 Skill（可被 Hub 包覆盖） |
| `cmd-propose` … `cmd-archive` | guide.command | 各阶段 | Cursor 斜杠命令源文件 |
| `cmd-prd` / `cmd-arch` / `cmd-arch-lld` | guide.command | Pre-phase | 组织级命令 |

### 6.2 本地自定义资产目录

```
harnessX/assets/guides/<my-skill>/
  asset.yaml
  SKILL.md
```

发布到 Hub 前须：`hx asset promote --to trial` → `hx asset backfill` → `hx asset scan` → `hx hub promote`。

---

## 7. `asset.yaml` 规范

每个可发布资产目录必须包含 `asset.yaml`：

```yaml
id: my-api-skill
kind: guide.skill          # 见 §3.1 kind 表
version: 1.0.0
origin: local              # local | hub | builtin | team | change
status: draft              # draft | trial | enforced | deprecated
execution: inferential     # guide 必填：computational | inferential
phase: [design, apply]     # 生效阶段
owner: platform-team       # 可选
provenance:
  - type: repo
    ref: orders-service#abc123
metrics:                   # 由 hx asset backfill 回填
  runs: 0
  failures: 0
```

Hub 侧额外元数据（由 `hx hub promote` 写入）包括 `category`（package/bundle/blueprint）与 `.review` 侧车。

---

## 8. 资产生命周期

```
draft → trial → enforced → deprecated → archived
         ↑                    ↑
    本地验证              替代版本上线
```

| 状态 | 含义 | 谁能消费 |
| --- | --- | --- |
| `draft` | 草稿，未验证 | 仅作者本地 |
| `trial` | 试用，有运行数据 | 指定仓库 |
| `enforced` | 组织强制 | 全公司（须 Hub review approved） |
| `deprecated` | 废弃，仍可读 | 已安装者可继续，不建议新装 |
| `archived` | 归档 | 不可新装 |

**Hub 评审状态**（`.review`）：`pending` → `approved` / `rejected`

```bash
# 本地提升
hx asset promote ./harnessX/assets/guides/my-skill --to trial

# Hub 侧提升（须已 approved）
hx hub asset promote my-skill@1.0.0 --hub <hub> --to enforced

# 废弃
hx hub asset deprecate my-skill@1.0.0 --hub <hub> --reason "replaced by my-skill@2.0.0"
```

---

## 9. 平台组：Hub 初始化与日常维护

### 9.1 首次建立组织 Hub

```bash
# 从内置 Golden 种子创建
hx hub seed ./harness-hub

# 可选：直接提交并推送到远程
hx hub seed ./harness-hub \
  --submit \
  --remote git@github.com:your-org/hx-hub.git \
  --branch main \
  --message "chore: seed harness hub golden packages"

# 重建检索索引
hx hub search --hub ./harness-hub --index
```

### 9.2 发布新 Package（Skill 示例）

**场景**：订单团队沉淀了 `idempotency-keys` Skill，平台组推广到全公司。

```bash
# 1. 作者在业务仓库准备资产
cd orders-service
hx asset backfill harnessX/assets/guides/idempotency-keys
hx asset scan harnessX/assets/guides/idempotency-keys
hx asset promote harnessX/assets/guides/idempotency-keys --to trial

# 2. 发布到 Hub（带证据）
hx hub promote harnessX/assets/guides/idempotency-keys \
  --hub git@github.com:your-org/hx-hub.git \
  --by wang.dev \
  --evidence "8 weeks: flaky time tests 11/mo → 0; steer report INC-wiki/clock"

# 3. 平台评审人批准
hx hub review approve idempotency-keys@1.0.0 \
  --hub git@github.com:your-org/hx-hub.git \
  --reviewer zhao.platform

# 4. 推进到 enforced + 策略检查
hx hub asset promote idempotency-keys@1.0.0 \
  --hub git@github.com:your-org/hx-hub.git \
  --to enforced
hx hub policy check --hub git@github.com:your-org/hx-hub.git --strict

# 5. 评估报告（可选）
hx hub eval idempotency-keys@1.0.0 \
  --hub git@github.com:your-org/hx-hub.git \
  --out /tmp/idempotency-eval.json
```

### 9.3 发布新 Template（UAT 清单类）

```bash
# 模版目录结构
harnessX/assets/guides/my-uat/
  asset.yaml          # kind: guide.template, phase: [verify]
  template.md

hx hub promote harnessX/assets/guides/my-uat \
  --hub <hub> --by qa.lead --evidence "used in 3 releases"
hx hub approve my-uat@1.0.0 --hub <hub> --reviewer tm.zhang
```

消费方在 change 中复制：`cp harnessX/.hub-cache/my-uat/template.md harnessX/changes/<id>/uat-checklist.md`

### 9.4 发布 Rubric（`sensor.rubric`）

参考 Golden 包 `common-review-rubrics@1.0.0`：

```
packages/common-review-rubrics/1.0.0/
  asset.yaml          # kind: sensor.rubric
  rules.yaml          # 规则列表（pattern + status: trial|enforced）
```

```bash
hx hub promote ./path/to/common-review-rubrics \
  --hub <hub> --by architect
# 在 harness.yaml 注册 sensor.rubric 并引用 hub-cache 路径
```

### 9.5 发布 / 升级 Bundle

**从内置 Bundle 首次发布**（运维角色，`kind: harness.bundle`）：

```bash
# 目录含 asset.yaml + bundle.yaml + assets/
hx hub promote ./path/to/api-service-bundle --by platform --evidence "golden eval pass"
hx hub eval api-service@1.0.0 --golden minimal-api
hx hub review approve api-service@1.0.0 --reviewer platform
```

**升级 Bundle（1.0.0 → 1.1.0）**：

1. 更新目录内 `bundle.yaml` / 资产内容
2. 递增 `asset.yaml` 的 `version`
3. `hx hub promote` 新目录 → 评审 → `hx hub push`
4. 通知消费方对 **Package** 执行 `hx hub sync`（Bundle 已安装项目需重新 `hx bundle add --hub`）

### 9.6 发布 / 维护 Blueprint

参考 `enterprise-sdlc@1.0.0`：

```yaml
# blueprints/enterprise-sdlc/1.0.0/blueprint.yaml
name: enterprise-sdlc
extends: enterprise-sdlc          # 对应 harness.yaml profiles
hub_deps:
  - prd-writing@1.0.0
  - uat-checklist@1.0.0
  - ...
phases:
  explore:
    guides: [requirements-research-outline]
  test-design:
    guides: [design-template]
```

```bash
hx init --from-hub enterprise-sdlc@1.0.0 --hub <hub> --adapter cursor
# 验证写入 harnessX/blueprint.yaml 与 config profile
```

升级蓝图时：**必须** semver 新版本；已初始化项目不会自动切换 profile，需人工 `hub sync` 依赖包。

### 9.7 Steering 闭环发布（失败 → 规则 → Hub）

```bash
hx steer report
hx steer distill
hx asset backfill harnessX/assets/guides/distilled-rule
hx steer publish harnessX/assets/guides/distilled-rule \
  --hub <hub> --by author.name
# 自动执行 hub eval；draft → trial；hub review pending
```

---

## 10. 业务仓库：消费与本地定制

### 10.1 安装 Hub 包

```bash
# config.yaml 已配置 hub: git@github.com:your-org/hx-hub.git
hx hub add prd-writing@1.0.0 --hub <hub>
hx lock write
hx lock verify
```

在 `harness.yaml` 注册：

```yaml
guides:
  - id: prd-writing
    kind: guide.skill
    execution: inferential
    phase: [propose]
    source: .hub-cache/prd-writing/SKILL.md
```

```bash
hx adapter sync    # 同步到 .cursor/skills/ 等
```

### 10.2 从 Hub 初始化项目

```bash
# 拓扑 Bundle
hx init --from-hub api-service@1.0.0 --hub <hub> --adapter cursor

# 企业蓝图
hx init --from-hub enterprise-sdlc@1.0.0 --hub <hub>
```

### 10.3 升级与三方合并

```bash
# 查看可升级项
hx hub sync --hub <hub>

# 应用合并
hx hub sync --hub <hub> --apply
hx lock write && hx lock verify

# 冲突时
hx hub sync --hub <hub> --apply --force
# 人工解决 SKILL.md 中 <<<<<<< local 标记后
hx lock write
```

### 10.4 本地定制（正规出口）

**禁止**直接改 `.hub-cache/` 而不留痕。应使用 `harness.yaml` 的 `overrides`：

```yaml
overrides:
  - id: prd-writing
    source: assets/guides/prd-writing-local/SKILL.md
    reason: "RetailCo 合规章节，尚未贡献回 Hub"
```

或使用 `imports:` 保持 `harness.yaml` 精简：

```yaml
imports:
  - api-service@1.0.0
```

---

## 11. 命令速查

### 11.1 本地资产

| 命令 | 说明 |
| --- | --- |
| `hx asset list [--change <id>]` | 列出已解析资产及层级 |
| `hx asset promote <dir> --to <status>` | 本地生命周期 |
| `hx asset backfill <dir>` | 遥测回填 metrics |
| `hx asset scan <dir>` | 注入扫描 |
| `hx lock write` / `hx lock verify` | 锁定 / 校验哈希 |

### 11.2 Hub 运维

| 命令 | 说明 |
| --- | --- |
| `hx hub golden` | 列出内置 Golden 包 / Bundle / Blueprint |
| `hx hub seed [path]` | 种子 Hub（含 hub-policy.yaml） |
| `hx hub add <id>@<ver> [--hub]` | 安装到 .hub-cache（config 可省略 --hub） |
| `hx hub sync [--hub] [--apply] [--force]` | 检查 / 合并升级 |
| `hx hub promote <dir> --by <name>` | 运维：发布到正式目录（自动识别 package/bundle/blueprint） |
| `hx hub submit <dir> [--evidence]` | 使用：提交到 contributions/ 待审核 |
| `hx hub contributions list/accept/reject` | 运维：贡献审核队列 |
| `hx hub push [--message]` | 运维：提交并推送 Hub Git 变更 |
| `hx hub search [q] [--category]` | 检索 |
| `hx hub asset info/promote/deprecate` | Hub 侧生命周期 |
| `hx hub review request/approve/reject` | 评审工作流 |
| `hx hub policy check [--strict]` | 治理策略 |
| `hx hub eval <id>@<ver> [--local] [--golden] [--list]` | 质量评估（支持 Bundle/Blueprint） |
| `hx hub cache gc` | 清理远端镜像缓存 |

### 11.3 相关

| 命令 | 说明 |
| --- | --- |
| `hx steer publish <dir> --hub <path>` | Steering → Hub 闭环 |
| `hx adapter sync` | Hub/本地资产 → IDE 适配器 |
| `hx bundle list [--hub <path>]` | 拓扑 Bundle 列表 |

---

## 12. CI 建议

**Hub 仓库（发布侧）**：

```yaml
- run: hx hub policy check --hub . --strict
- run: hx hub eval api-conventions@1.0.0 --hub . --golden minimal-api
```

**业务仓库（消费侧）**：

```yaml
- run: hx lock verify
- run: hx hub sync --hub $HX_HUB_URL --offline   # PR 预览
- run: hx adapter drift
```

---

## 13. 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `hub package failed injection scan` | SKILL 含劫持指令 | `hx asset scan` 定位并删除 |
| `already published — bump the version` | 版本不可变 | 递增 `asset.yaml` version |
| `LOCK content changed since lock` | 改了 .hub-cache 未重锁 | 恢复文件或走 overrides + `hx lock write` |
| `update-and-local-changes` | 本地改过 Hub 包 | 抽 overrides 或贡献回 Hub |
| `enforced asset is not approved` | policy 检查失败 | `hx hub review approve` |
| `merge conflicts` | 同步冲突 | `--force` 后人工合并 |
| Hub 包未进入 Context Pack | 未注册 harness.yaml | 添加 guides/sensors 条目 + `adapter sync` |

---

## 14. 维护检查清单（季度）

- [ ] `hx hub policy check --strict` 全绿
- [ ] `hx hub catalog rebuild` 更新 index
- [ ] 废弃包已 `deprecate` 并通知消费方
- [ ] `enforced` 包均有 `owner` 与评审记录
- [ ] 注入扫描红队演练（见场景 08 §5）
- [ ] Golden eval 通过（`hx hub eval --golden`）
- [ ] 消费方 `harness.lock` 漂移审计

---

## 15. 延伸阅读

- [操作说明 §9.1 Hub 资产管理](operation-guide.zh-CN.md#91-hub-资产管理命令本次升级新增)
- [场景 08：Hub 供应链](examples/08-hub-资产共享与供应链.md)
- [场景 16：Hub 蓝图初始化](examples/16-v0.3-hub-blueprint-init.md)
- [packages/hub-golden/README.md](../packages/hub-golden/README.md)
