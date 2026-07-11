# hxhub 使用手册

**适用角色**：总架构师、平台组 Hub 维护者、资产作者、业务仓库负责人  
**版本**：HarnessX v0.6+  
**关联场景**：[08 Hub 资产共享与供应链](examples/08-hub-资产共享与供应链.md) · [16 Hub 蓝图初始化](examples/16-v0.3-hub-blueprint-init.md) · [17 平台治理与仪表盘](examples/17-v0.4-平台治理与仪表盘.md) · [21 Hub 双角色与贡献审核](examples/21-hub-双角色与贡献审核.md)

---

## 1. 概述与定位

`hxhub` 是面向 **Hub 运维** 的独立 CLI，覆盖资产种子化、发布、贡献审核、脚手架、诊断与建议。`hx` 与 `hxhub` 长期并存：

| CLI | 主要定位 |
| --- | --- |
| `hx` | 项目交付流程 + 兼容 `hx hub` 入口 |
| `hxhub` | Hub 运维、资产创建、诊断（doctor）、建议（help） |

**Harness Hub** 是组织级资产仓库（通常是一个 Git 仓库），用于分发 **Guide（前馈）**、**Sensor（反馈）**、拓扑 **Bundle** 与交付 **Blueprint**。业务仓库通过 `config.yaml` 的 `hub:` 字段引用 Hub，将资产安装到 `harnessX/.hub-cache/`，并用 `harness.lock` 锁定内容哈希。

本文档合并了原「hxhub 使用手册」与「Hub 资产维护手册」，作为 Hub 运维与资产治理的**唯一中文参考**。

**快速跳转**：资产从零创建到发布 → [§3.3 资产创建与发布（指南）](#33-资产创建与发布指南)；**draft → trial → enforced** → [§3.4 生命周期状态管理](#34-资产生命周期状态管理draft--trial--enforced)；命令参数详情 → [§4.13 `hxhub asset`](#413-hxhub-asset--脚手架与-hub-侧生命周期)。

---

## 2. 核心概念

### 2.1 信任模型（四道关卡）

| 关卡 | 机制 |
| --- | --- |
| 版本不可变 | 同一 `id@version` 不可重复发布 |
| 发布评审 | `.review` 侧车文件，`hxhub review approve` |
| 双向注入扫描 | `hx asset scan` / `hxhub add` / `hxhub promote` |
| 消费端锁定 | `hx lock write` + CI `hx lock verify` |

**资产解析优先级**（高 → 低）：`change` > `local` > `team` > `hub` > `builtin`

### 2.2 双角色连接（运维 / 使用）

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
| `consumer` | 检索、安装、同步；`hxhub submit` 提交到 `contributions/` |
| `maintainer` | 正式发布 `hxhub promote`、审核 `hxhub contributions accept`、策略检查、`hxhub push` |

配置 `hub` 后，多数 `hxhub` 命令**无需再传 `--hub`**。Hub 仓库根目录的 `hub-policy.yaml` 定义维护者白名单与 `installRequiresApproval` 等策略。

### 2.3 Hub 仓库目录结构

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
└── index.json                   # 可选：由 hxhub search --index 生成
```

**远程引用**：`--hub` 可为本地路径或 Git URL（如 `git@github.com:your-org/hx-hub.git`）。首次克隆缓存于 `harnessX/.hub-remotes/<hash>/repo`。

### 2.4 资产类型

#### Package（`packages/`）

单包资产，通过 `hxhub add <id>@<ver>` 安装到 `.hub-cache/`。

| kind | 类别 | 典型文件 | 用途 |
| --- | --- | --- | --- |
| `guide.skill` | Guide · 推断型 | `SKILL.md` + 可选 `references/`、`examples/` 等 | Agent 写作/编码规范（目录型 skill 包） |
| `guide.template` | Guide · 计算型 | `template.md` | 脚手架模版（UAT 清单、调研报告） |
| `sensor.rubric` | Sensor · 推断型 | `rules.yaml` | 评审 Rubric 规则集 |
| `guide.constraint` | Guide · 计算型 | `*.yaml` | 架构分层等硬约束（多在 Bundle 内） |
| `guide.command` | Guide · 推断型 | `*.md` | 斜杠命令说明（多在 Bundle / base 内） |

#### Bundle（`bundles/`）

拓扑 Bundle，`kind: harness.bundle`。包含一组 **guides + sensors + suites**，用于 `hx init --bundle` 或 `hx init --from-hub api-service@1.0.0`。

#### Blueprint（`blueprints/`）

交付蓝图，`kind: harness.blueprint`。定义 `extends` profile、`hub_deps` 与阶段级 guides/sensors，用于 `hx init --from-hub enterprise-sdlc@1.0.0`。

#### Eval（`evals/`）

Golden 仓库检查集，供 `hxhub eval --golden <name>` 验证 Hub 包在代表性项目上的表现。

### 2.5 `asset.yaml` 规范

每个可发布资产目录必须包含 `asset.yaml`：

```yaml
id: my-api-skill
kind: guide.skill          # 见 §2.4 kind 表
version: 1.0.0
origin: local              # local | hub | builtin | team | change
status: draft              # draft | trial | enforced | deprecated
execution: inferential     # guide 必填：computational | inferential
stage: dev                 # 必填：req | arch | dev | test
task: design               # 可选；省略则对该 stage 下所有 task 生效
owner: platform-team       # 可选
provenance:
  - type: repo
    ref: orders-service#abc123
metrics:                   # 由 hx asset backfill 回填
  runs: 0
  failures: 0
```

**stage / task 说明**（v0.6 四阶段模型）：

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `stage` | 是 | 资产所属交付阶段（`req` / `arch` / `dev` / `test`） |
| `task` | 否 | 阶段内具体任务（如 `propose`、`design`、`apply`、`verify`） |

- **写了 `task`**：仅在对应 task 的 Context Pack 或 Gate 中生效（推荐用于模板、命令、任务专属 Skill）。
- **省略 `task`**：该 stage 下所有 task 均会注入（适合跨 task 通用规范，但会增加上下文噪音）。

Hub 侧额外元数据（由 `hxhub promote` 写入）包括 `category`（package/bundle/blueprint）与 `.review` 侧车。

### 2.6 资产生命周期

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

**合法状态转换**（本地 `asset.yaml` 与 Hub 元数据均遵循）：

| 当前状态 | 可转换到 |
| --- | --- |
| `draft` | `trial`、`deprecated` |
| `trial` | `enforced`、`deprecated`、`draft` |
| `enforced` | `deprecated` |
| `deprecated` | `archived`（Hub 侧） |

> **不可跳级**：`draft` 不能直接变为 `enforced`，须先进入 `trial`。

**两层状态管理**（易混淆，须区分）：

| 层级 | 状态写在 | 变更命令 | 典型场景 |
| --- | --- | --- | --- |
| **本地** | 资产目录内 `asset.yaml` | `hx asset promote <dir> --to …` | `hxhub asset create` 后、发布到 Hub 前 |
| **Hub** | Hub 包目录元数据 + `asset.yaml` | `hxhub asset promote <id>@<ver> --to …` | 已 `hxhub promote` 写入 Hub 之后 |

**Hub 评审状态**（`.review`，与 lifecycle 独立）：`pending` → `approved` / `rejected`。`enforced` 资产通常要求 `.review` 为 `approved`（见 `hxhub policy check`）。

详细操作见 [§3.4 资产生命周期状态管理](#34-资产生命周期状态管理draft--trial--enforced)。

---

## 3. 快速开始

### 3.1 轻量初始化运维项目

```bash
hxhub init . --hub git@github.com:your-org/hx-hub.git --actor zhao.platform
```

`hxhub init` 仅创建运维最小集：

- `harnessX/config.yaml`（`hub.role: maintainer`）
- `harnessX/roles.yaml`
- `.gitignore`（忽略 `harnessX/.hub-remotes/`、`harnessX/.hub-cache/`）
- `README.hxhub.md`

> 不会创建 `changes/`、`specs/`、`workorders/` 等交付目录（与 `hx init` 不同）。

### 3.2 首次检查

```bash
hxhub doctor --fix-hints
hxhub search --category package
hxhub policy check --strict
```

### 3.3 资产创建与发布（指南）

本节说明如何用 `hxhub asset create` 从零创建资产，并通过 `promote` → `review` → `push` 发布到组织 Hub。等价命令 `hx hub asset create` 与 `hx hub promote` 行为相同。

#### 3.3.1 流程总览

```text
创建脚手架          编辑内容           本地校验              发布到 Hub              评审与推送           业务仓库消费
hxhub asset create → 编辑 SKILL.md 等 → hx asset scan     → hxhub promote/submit → review approve     → hxhub add
                     完善 asset.yaml    hx asset backfill     hxhub asset promote      hxhub push           harness.yaml 注册
                                                                 (→ enforced)                              hx lock write
```

| 步骤 | 命令 | 角色 | 说明 |
| --- | --- | --- | --- |
| 1. 创建 | `hxhub asset create` | 作者 | 生成 `asset.yaml` 与内容骨架 |
| 2. 编辑 | （手工） | 作者 | 填写 Skill/模版/Rubric 正文，确认 `stage`/`task` |
| 3. 校验 | `hx asset scan` / `hx asset backfill` | 作者 | 注入扫描；可选回填 metrics |
| 3b. 本地状态 | `hx asset promote <dir> --to trial` | 作者 | **必须**：离开 `draft` 后才能 `hxhub promote`（见 §3.4） |
| 4. 发布 | `hxhub promote` 或 `hxhub submit` | maintainer / consumer | 写入 Hub 正式目录或 `contributions/` |
| 5. 评审 | `hxhub review approve` | maintainer | `.review` → `approved` |
| 6. 提升 | `hxhub asset promote --to enforced` | maintainer | 组织级强制（可选，视策略） |
| 7. 推送 | `hxhub push` | maintainer | 同步到远程 Git Hub |
| 8. 消费 | `hxhub add` + `harness.yaml` | consumer | 安装到 `.hub-cache/` 并注册 |

> **版本不可变**：同一 `id@version` 只能发布一次；升级须递增 `asset.yaml` 中的 `version` 后重新 `promote`。

#### 3.3.2 创建脚手架：`hxhub asset create`

**非交互式**（推荐 CI / 脚本）：

```bash
hxhub asset create \
  --kind guide.skill \
  --id clock-safety \
  --asset-version 1.0.0 \
  --status draft \
  --stage dev \
  --task apply \
  --source-dir ./drafts/clock-safety \
  --out ./assets/clock-safety
```

**交互式**（缺 `--kind` 或 `--id` 时也会自动进入）：

```bash
hxhub asset create --interactive
```

交互时会依次询问：asset id、kind、version、status、stage、task（可空）、源路径、输出目录。

**`--source-dir` 用法**：

| 传入类型 | 行为 |
| --- | --- |
| 目录 | 复制目录内已有 `SKILL.md` / `template.md` / `rules.yaml` 等 |
| 单个文件 | 复制为对应 kind 的主文件名（如 `.md` → `template.md`） |
| 省略 | 生成空白骨架文件 |

**各 kind 自动生成文件**：

| `--kind` | 主内容文件 | 典型 `stage.task` |
| --- | --- | --- |
| `guide.skill` | `SKILL.md` + 可选子目录 | `dev.apply`、`dev.design` |
| `guide.template` | `template.md` | `dev.propose`、`dev.design` |
| `sensor.rubric` | `rules.yaml` | `dev.verify` |
| `harness.bundle` | `bundle.yaml` + `assets/` | （Bundle 内 guides 各自声明） |
| `harness.blueprint` | `blueprint.yaml` | （Blueprint 按 `stages` 键 wiring） |

创建成功后输出示例：

```text
created /path/to/assets/clock-safety
  + asset.yaml
  + SKILL.md
```

**`guide.skill` 目录包约定**（`asset.yaml` 与 `SKILL.md` 位于包根目录）：

```text
assets/guides/business-insight/
├── asset.yaml
├── SKILL.md              # 主入口，可在正文中链接 references/、examples/
├── references/
│   └── market-framework.md
└── examples/
    └── sample-report.md
```

`harness.yaml` 中 `source` 可写目录（推荐）或 `SKILL.md` 路径（兼容旧写法）：

```yaml
source: assets/guides/business-insight
# 或 source: assets/guides/business-insight/SKILL.md
```

`hxhub asset create --source-dir` 会复制源目录内除 `asset.yaml` 外的全部附属文件。`hx adapter sync` 将整包同步到 `.cursor/skills/<id>/`。

#### 3.3.3 按 kind 的完整样例

**样例 A — `guide.skill`（编码规范）**

```bash
mkdir -p ./drafts/idempotency-keys
cat > ./drafts/idempotency-keys/SKILL.md <<'EOF'
# Idempotency Keys

- Use client-supplied idempotency keys for all mutating POST endpoints.
- Never compare absolute timestamps in assertions; inject a Clock.
EOF

hxhub asset create \
  --kind guide.skill \
  --id idempotency-keys \
  --asset-version 1.0.0 \
  --stage dev \
  --task apply \
  --source-dir ./drafts/idempotency-keys \
  --out ./assets/idempotency-keys

hx asset scan ./assets/idempotency-keys
```

**样例 B — `guide.template`（从单个 Markdown 导入）**

```bash
echo "# 功能需求模版\n\n## 目标\n\n## 验收标准" > ./功能需求模版.md

hxhub asset create \
  --kind guide.template \
  --id feature-requirements-template \
  --asset-version 1.0.0 \
  --stage dev \
  --task propose \
  --source-dir ./功能需求模版.md \
  --out ./assets/feature-requirements-template
```

**样例 C — `sensor.rubric`（verify 阶段评审规则）**

```bash
hxhub asset create \
  --kind sensor.rubric \
  --id ux-consistency-rubric \
  --asset-version 1.0.0 \
  --stage dev \
  --task verify \
  --out ./assets/ux-consistency-rubric

# 编辑 rules.yaml 后，在 harness.yaml 的 profile.suites["dev.verify"] 中引用该 sensor id
```

**样例 D — `harness.bundle`（拓扑 Bundle）**

```bash
hxhub asset create \
  --kind harness.bundle \
  --id my-api-bundle \
  --asset-version 1.0.0 \
  --out ./assets/my-api-bundle

# 编辑 bundle.yaml，声明 guides、sensors、suites；assets/ 下放置约束与 Skill 文件
```

**样例 E — `harness.blueprint`（交付蓝图）**

```bash
hxhub asset create \
  --kind harness.blueprint \
  --id my-blueprint \
  --asset-version 1.0.0 \
  --out ./assets/my-blueprint

# 编辑 blueprint.yaml，示例：
# name: my-blueprint
# extends: standard
# hub_deps:
#   - prd-writing@1.0.0
# stages:
#   dev.propose:
#     guides: [prd-writing]
#   dev.design:
#     guides: [prototype-wireframe]
```

#### 3.3.4 从业务仓库已有资产发布

若 Skill 已在业务仓库 `harnessX/assets/guides/` 下沉淀，可跳过 `asset create`，直接走发布流程：

```bash
# === 作者在业务仓库 ===
cd orders-service
hx asset backfill harnessX/assets/guides/idempotency-keys
hx asset scan harnessX/assets/guides/idempotency-keys
hx asset promote harnessX/assets/guides/idempotency-keys --to trial

# === 平台组在 hx-hub-ops（maintainer）===
cd hx-hub-ops
hxhub promote ../orders-service/harnessX/assets/guides/idempotency-keys \
  --by wang.dev \
  --evidence "8 weeks: flaky time tests 11/mo → 0"
hxhub review approve idempotency-keys@1.0.0 --reviewer zhao.platform
hxhub asset promote idempotency-keys@1.0.0 --to enforced
hxhub policy check --strict
hxhub push --message "publish: idempotency-keys@1.0.0"
```

Consumer 作者无 maintainer 权限时，将 `hxhub promote` 换为 `hxhub submit`（见 §6.5）。

#### 3.3.5 Maintainer 发布 checklist（从零创建）

在运维项目 `hx-hub-ops` 中执行：

```bash
# 1. 创建并编辑
hxhub asset create --kind guide.skill --id my-skill --asset-version 1.0.0 \
  --stage dev --task apply --out ./assets/my-skill
# 编辑 ./assets/my-skill/SKILL.md 与 asset.yaml

# 2. 本地校验 + 本地状态提升（draft 不能直接 publish）
hx asset scan ./assets/my-skill
hx asset promote ./assets/my-skill --to trial    # 或 --to enforced（须满足 metrics 门槛，见 §3.4）

# 3. 写入 Hub 镜像（.review → pending）
hxhub promote ./assets/my-skill --by zhao.platform --evidence "ci://runs/1820"

# 4. 评审与提升
hxhub review approve my-skill@1.0.0 --reviewer zhao.platform
hxhub asset promote my-skill@1.0.0 --to enforced   # 视 hub-policy 策略可选 trial
hxhub policy check --strict

# 5. 推送到远程
hxhub push --message "publish: my-skill@1.0.0"
```

#### 3.3.6 消费方安装与注册

Package 发布并 `push` 后，业务仓库：

```bash
hxhub add my-skill@1.0.0
```

在 `harness.yaml` 注册（若未通过 Blueprint 自动 wiring）：

```yaml
guides:
  - id: my-skill
    kind: guide.skill
    execution: inferential
    stage: dev
    task: apply
    source: .hub-cache/my-skill/SKILL.md
```

随后：

```bash
hx lock write
hx lock verify
hx adapter sync
```

验证 Context Pack 是否包含该 Skill：

```bash
hx guide pack <change> --stage dev --task apply
```

#### 3.3.7 与状态提升的关系

`hxhub asset create` 默认生成 `status: draft`。在调用 `hxhub promote` 发布到 Hub **之前**，须用 `hx asset promote` 将本地状态至少提升到 `trial`（详见 **§3.4**）。若跳过此步，`hxhub promote` 会报错：`draft assets cannot be promoted to the hub`。

---

### 3.4 资产生命周期状态管理（draft → trial → enforced）

本节说明 `hxhub asset create` 创建的资产（默认 `draft`）如何提升到 `trial` 或 `enforced`，以及本地与 Hub 两层命令的区别。

#### 3.4.1 命令对照（最易混淆）

| 目的 | 命令 | 作用对象 |
| --- | --- | --- |
| 改**本地目录**内 `asset.yaml` 的 `status` | `hx asset promote <dir> --to trial\|enforced\|deprecated` | `./assets/my-skill/` 等本地路径 |
| 将本地资产**写入 Hub 仓库** | `hxhub promote <dir> --by <name>` | 同上本地目录 → Hub `packages/` 等 |
| 改 **Hub 已发布包**的生命周期状态 | `hxhub asset promote <id>@<version> --to …` | Hub 中已存在的 `id@version` |

等价写法：`hx hub asset promote` = `hxhub asset promote`；`hx hub promote` = `hxhub promote`。

> **记忆口诀**：带**目录路径**的 `promote` 是「发布」或「改本地」；带 **`id@version`** 的 `asset promote` 是「改 Hub 上已发布包的状态」。

#### 3.4.2 本地：draft → trial

`hxhub asset create` 完成后，资产处于本地 `draft`，**不能**直接 `hxhub promote`。

```bash
# 1. 编辑 SKILL.md / template.md 等内容

# 2. 注入扫描（建议）
hx asset scan ./assets/my-skill

# 3. 本地状态：draft → trial
hx asset promote ./assets/my-skill --to trial
```

成功后 `./assets/my-skill/asset.yaml` 中 `status` 变为 `trial`。可用以下命令确认：

```bash
hx asset list    # 或 cat ./assets/my-skill/asset.yaml | grep status
```

#### 3.4.3 本地：trial → enforced

```bash
# 可选：从 harnessX/runs/ 遥测回填 runs/failures 等指标
hx asset backfill ./assets/my-skill

hx asset promote ./assets/my-skill --to enforced
```

**数据驱动门槛**（`trial` → `enforced` 时 CLI 强制校验）：

| 条件 | 要求 |
| --- | --- |
| `metrics.evaluations` | ≥ 5 |
| 误报率 `metrics.falsePositives / metrics.evaluations` | ≤ 20% |

指标不足时命令失败，提示类似 `needs >=5 recorded evaluations`。应在 `trial` 阶段让资产在真实 change 中运行足够次数，通过 `hx asset backfill` 回填；**不要**在生产流程中手工伪造 metrics。

若暂时只需在少数仓库试用，**停在 `trial` 即可**，不必升到 `enforced`。

#### 3.4.4 发布到 Hub（须已离开 draft）

本地状态为 `trial` 或 `enforced` 后：

```bash
hxhub eval --local ./assets/my-skill    # 可选预检
hxhub promote ./assets/my-skill \
  --by zhao.platform \
  --evidence "ci://runs/1820"
```

`hxhub promote` 还会执行：注入扫描、结构校验、写入 `.review`（初始 `pending`）。**不会**自动把 Hub 侧状态设为 `enforced`——发布时 Hub 元数据继承本地 `asset.yaml` 中的 `status`。

#### 3.4.5 Hub 侧：trial → enforced

资产已在 Hub（`packages/<id>/<version>/`）后，由 maintainer 执行：

```bash
# 1. 评审通过（policy 要求 enforced 须 approved）
hxhub review approve my-skill@1.0.0 --reviewer zhao.platform

# 2. Hub 生命周期提升
hxhub asset promote my-skill@1.0.0 --to enforced

# 3. 策略检查 + 推送
hxhub policy check --strict
hxhub push --message "promote: my-skill@1.0.0 to enforced"
```

查看当前 Hub 包状态与评审：

```bash
hxhub asset info my-skill@1.0.0
```

#### 3.4.6 端到端示例（create → trial → 发布 → enforced）

```bash
# --- 本地：创建 ---
hxhub asset create --kind guide.skill --id my-skill --asset-version 1.0.0 \
  --stage dev --task apply --out ./assets/my-skill
# 编辑 ./assets/my-skill/SKILL.md

# --- 本地：draft → trial ---
hx asset scan ./assets/my-skill
hx asset promote ./assets/my-skill --to trial

# --- 发布到 Hub ---
hxhub promote ./assets/my-skill --by zhao.platform --evidence "pilot in 2 repos"

# --- Hub：评审 + enforced ---
hxhub review approve my-skill@1.0.0 --reviewer zhao.platform
hxhub asset promote my-skill@1.0.0 --to enforced
hxhub push --message "publish: my-skill@1.0.0 enforced"
```

#### 3.4.7 常见错误

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `draft assets cannot be promoted to the hub` | 本地仍为 `draft` 就执行了 `hxhub promote` | 先 `hx asset promote <dir> --to trial` |
| `illegal transition draft → enforced` | 本地跳级 | 先 `--to trial`，再 `--to enforced` |
| `promotion blocked: needs >=5 recorded evaluations` | trial→enforced 指标不足 | 在 trial 阶段多运行并 `hx asset backfill` |
| `enforced asset is not approved` | Hub policy 检查失败 | `hxhub review approve` 后再 `asset promote --to enforced` |
| `already published — bump the version` | 同版本重复 publish | 递增 `asset.yaml` 的 `version` 后重新发布 |

---

## 4. 命令参考

以下命令均以 `hxhub` 为前缀。等价写法 `hx hub <cmd>` 仍可用（兼容入口），但新运维项目建议统一使用 `hxhub`。

**通用选项**（多数命令支持）：

| 选项 | 说明 |
| --- | --- |
| `--hub <path>` | Hub 源（本地路径或 Git URL）；`config.yaml` 已配置时可省略 |
| `--offline` | 使用本地镜像缓存，不拉取远程 |
| `--refresh` | 操作前强制刷新远程缓存 |

---

### 4.1 `hxhub init` — 初始化运维项目

```bash
hxhub init [dir] [--hub <git-url>] [--actor <name>]
```

| 参数/选项 | 说明 |
| --- | --- |
| `[dir]` | 目标目录，默认当前目录 |
| `--hub` | 预填 `config.yaml` 中的 `hub.source` |
| `--actor` | 默认运维身份（`hub.actor`） |

**作用**：创建轻量运维工作区，不生成交付目录。适用于已有远程 Hub 的平台组建立 `hx-hub-ops` 运维仓库。

---

### 4.2 `hxhub golden` — 列出内置 Golden 资产

```bash
hxhub golden
```

输出内置可种子化的 package、bundle、blueprint 列表（`id@version`）。不写入文件，仅作查阅。

---

### 4.3 `hxhub seed` — 从 Golden 种子创建 Hub

```bash
hxhub seed [path] [选项]
```

| 参数/选项 | 说明 |
| --- | --- |
| `[path]` | 目标 Hub 目录，默认 `harness-hub` |
| `--profile <name>` | 治理配置：`minimal` \| `standard` \| `strict` \| `enterprise` \| `enterprise-sdlc` |
| `--scenario <names>` | 领域场景，逗号分隔：`core` \| `api` \| `frontend` \| `mobile` \| `library` \| `data` \| `observability` \| `async-jobs` |
| `--with <kinds>` | 资产类型：`guides` \| `sensors` \| `rubrics` \| `bundles` \| `blueprints` \| `evals` \| `commands` \| `all` |
| `--exclude <refs>` | 跳过的资产（`id@version`，逗号分隔） |
| `--full` | 复制完整 Golden Hub（未指定选择性参数时的默认行为） |
| `--dry-run` | 只打印种子计划，不写文件 |
| `--submit` | 种子化后 `git init/add/commit/push` |
| `--remote <git-url>` | 配合 `--submit`，远程仓库地址（必填） |
| `--branch <name>` | 推送分支，默认 `main` |
| `--message <text>` | 提交信息，默认 `seed hub assets` |

**作用**：从内置 Golden 资产写入 `packages/`、`bundles/`、`blueprints/`、`evals/` 及默认 `hub-policy.yaml`。种子资产的 `.review` 已为 `approved`，可立即被消费。

**示例**：

```bash
# 完整种子
hxhub seed ./harness-hub

# 按 profile + scenario 选择性种子
hxhub seed ./harness-hub --profile minimal --scenario api

# 预览计划
hxhub seed ./harness-hub --profile standard --scenario core,api --dry-run

# 种子并直接推送到 GitHub
hxhub seed ./harness-hub \
  --submit \
  --remote git@github.com:your-org/hx-hub.git \
  --branch main \
  --message "chore: seed harness hub golden packages"
```

> **注意**：远程 **hx-hub 已存在** 时，一般**不需要**再次 `seed`；应使用 `hxhub init` 连接远程 Hub 并以 maintainer 角色维护。

---

### 4.4 `hxhub add` — 安装 Hub 包到本地缓存

```bash
hxhub add <id>@<version> [--hub <path>]
```

| 参数/选项 | 说明 |
| --- | --- |
| `<id>@<version>` | 要安装的资产引用 |
| `--hub` | Hub 源，默认可从 `config.yaml` 读取 |

**作用**：将 Hub 包复制到 `harnessX/.hub-cache/<id>/`。若 `hub-policy.yaml` 中 `installRequiresApproval: true` 且角色为 `consumer`，仅允许安装已 `approved` 的资产。

**后续步骤**：在 `harness.yaml` 注册资产路径，执行 `hx lock write` 与 `hx adapter sync`。

---

### 4.5 `hxhub sync` — 检查或合并 Hub 包升级

```bash
hxhub sync [--hub <path>] [--apply] [--force] [--only <ids>] [--offline] [--refresh]
```

| 选项 | 说明 |
| --- | --- |
| `--apply` | 应用上游更新（三方合并） |
| `--force` | 即使有冲突也尝试合并 |
| `--only <ids>` | 仅同步指定包 ID（逗号分隔） |
| `--offline` | 不拉取远程，使用本地缓存 |
| `--refresh` | 操作前强制刷新远程镜像 |

**作用**：

- 无 `--apply`：列出已安装包与 Hub 最新版本的对比（`up-to-date` / `update-available` / `update-and-local-changes` 等）。
- 有 `--apply`：执行合并；冲突时输出 `<<<<<<< local` 标记，需人工解决后 `hx lock write`。

---

### 4.6 `hxhub promote` — 正式发布资产（maintainer）

```bash
hxhub promote <dir> --by <name> [选项]
```

| 参数/选项 | 说明 |
| --- | --- |
| `<dir>` | 本地资产目录（含 `asset.yaml`） |
| `--by <name>` | 发布者身份（必填） |
| `--evidence <ref>` | 价值证据（如 `ci://runs/1820`、steer 报告链接） |
| `--skip-policy` | 跳过发布前策略检查 |
| `--skip-eval` | 跳过发布前 eval |

**作用**：将资产写入 Hub 正式目录（`packages/` / `bundles/` / `blueprints/`，按 `kind` 自动识别）。创建 `.review` 侧车，初始状态为 `pending`。发布前默认执行策略检查与 eval。

**前置条件**：本地 `asset.yaml` 的 `status` **不能为 `draft`**——须先用 `hx asset promote <dir> --to trial`（或 `enforced`）提升本地状态，否则报错 `draft assets cannot be promoted to the hub`。详见 [§3.4](#34-资产生命周期状态管理draft--trial--enforced)。

**角色要求**：`maintainer`。

---

### 4.7 `hxhub submit` — 提交贡献（consumer）

```bash
hxhub submit <dir> [--actor <name>] [--evidence <ref>] [--skip-eval]
```

| 参数/选项 | 说明 |
| --- | --- |
| `<dir>` | 本地资产目录 |
| `--actor` | 提交者身份，默认 `config.yaml` 的 `hub.actor` |
| `--evidence` | 价值证据 |
| `--skip-eval` | 跳过提交前 eval |

**作用**：将资产写入 `contributions/<actor>/<id>/<version>/`，等待 maintainer 审核。Consumer 角色使用此命令，**不能**代替 `promote`。

---

### 4.8 `hxhub push` — 推送 Hub Git 变更

```bash
hxhub push [--message <text>] [--branch <name>] [--hub <path>]
```

| 选项 | 说明 |
| --- | --- |
| `--message` | 提交信息，默认 `chore: hub update` |
| `--branch` | 推送分支 |

**作用**：在 Hub 本地镜像中 `git add/commit/push` 到远程。`promote`、`contributions accept`、`review approve` 等操作修改的是本地镜像，须 `push` 才能同步到组织 Hub。

**角色要求**：`maintainer`，且对远程 Hub 具备写权限。

---

### 4.9 `hxhub search` — 检索 Hub 资产

```bash
hxhub search [query] [--kind <kind>] [--phase <phase>] [--category <cat>] [--index] [--hub <path>]
```

| 参数/选项 | 说明 |
| --- | --- |
| `[query]` | 关键词（匹配 id、描述等） |
| `--kind` | 按资产 kind 过滤 |
| `--phase` | 按生效阶段过滤 |
| `--category` | `package` \| `bundle` \| `blueprint` |
| `--index` | 生成/更新 `index.json` |

**作用**：在 Hub 目录中搜索资产。`--index` 用于重建检索索引，建议季度维护时执行。

---

### 4.10 `hxhub catalog rebuild` — 重建目录索引

```bash
hxhub catalog rebuild [--hub <path>]
```

等价于 `hxhub search --index`。写入 `index.json` 供 IDE / 工具消费。

---

### 4.11 `hxhub eval` — 质量评估

```bash
hxhub eval <id>@<version> [选项]
hxhub eval --local <dir>              # 本地目录预检，无需 pkg 参数
```

| 选项 | 说明 |
| --- | --- |
| `--local <dir>` | 评估本地资产目录（不需已发布） |
| `--golden <name>` | 对 golden-repo 验收集运行检查 |
| `--list` | 列出 Hub 中可用的 golden eval 集 |
| `--out <file>` | 将报告写入 JSON 文件 |

**作用**：对资产执行结构、注入扫描、golden-repo 等检查。`guide.skill` 额外校验 `skill package layout`（`SKILL.md` 位于包根目录）。发布前默认会触发 eval；失败时 `promote` 会中止（除非 `--skip-eval`）。

---

### 4.12 `hxhub contributions` — 贡献审核队列

```bash
hxhub contributions list [--status pending|approved|rejected] [--actor <name>]
hxhub contributions show <ref>
hxhub contributions accept <ref> --reviewer <name>
hxhub contributions reject <ref> --reviewer <name> --reason <text>
```

| 子命令 | 说明 |
| --- | --- |
| `list` | 列出贡献队列；`--status` 过滤评审状态 |
| `show <ref>` | 查看贡献详情（JSON）；ref 格式 `actor/id@version` |
| `accept` | 接受贡献，移入正式目录 |
| `reject` | 拒绝并记录原因 |

**角色要求**：`maintainer`；`--reviewer` 须在 `hub-policy.yaml` 的 `maintainers` 名单中。

---

### 4.13 `hxhub asset` — 脚手架与 Hub 侧生命周期

> 端到端 walkthrough 见 **§3.3 资产创建与发布（指南）**。

#### `hxhub asset create`

```bash
hxhub asset create [选项]
```

| 选项 | 说明 |
| --- | --- |
| `--kind` | `guide.skill` \| `guide.template` \| `sensor.rubric` \| `harness.bundle` \| `harness.blueprint` |
| `--id` | 资产 ID |
| `--asset-version` | 版本号（**不是** `--version`），默认 `0.1.0` |
| `--status` | `draft` \| `trial` \| `enforced` \| `deprecated`，默认 `draft` |
| `--stage` | 交付阶段：`req` \| `arch` \| `dev` \| `test`，默认 `dev` |
| `--task` | 阶段内任务（可选）；省略则对该 stage 所有 task 生效 |
| `--out` | 输出目录；默认以 `--id` 为目录名 |
| `--source-dir` | 源路径（**目录或单个文件**），复制已有 SKILL/模版/Rubric 内容 |
| `--interactive` | 交互式问答创建 |

**行为说明**：

- 缺少 `--kind` 或 `--id` 时自动进入交互模式。
- 写入 `asset.yaml`（含 `stage`/`task`/`execution` 等）及 kind 对应骨架文件。
- **不**连接 Hub、**不**发布；发布须另行执行 `hxhub promote` 或 `hxhub submit`。

**自动生成文件**：

| kind | 生成文件 |
| --- | --- |
| `guide.skill` | `SKILL.md` |
| `guide.template` | `template.md` |
| `sensor.rubric` | `rules.yaml` |
| `harness.bundle` | `bundle.yaml` + `assets/` |
| `harness.blueprint` | `blueprint.yaml` |

**快速示例**：

```bash
# Skill：从目录导入
hxhub asset create --kind guide.skill --id clock-safety --asset-version 1.0.0 \
  --stage dev --task apply --source-dir ./drafts/clock-safety --out ./assets/clock-safety

# 模版：从单个 Markdown 导入
hxhub asset create --kind guide.template --id feature-template \
  --stage dev --task propose --source-dir ./模版.md --out ./assets/feature-template

# 交互式
hxhub asset create --interactive
```

#### `hxhub asset install-github`

从 GitHub 仓库**直接克隆**并脚手架化 `guide.skill` 资产（含 `asset.yaml`、整包 `SKILL.md` 与 `references/` 等附属文件）。适用于 Cursor/开源 Skill 仓库、组织内 Skill 模板仓等。

```bash
hxhub asset install-github <github-url> [选项]
```

| 选项 | 说明 |
| --- | --- |
| `<github-url>` | 支持 `git@github.com:org/repo.git`、`https://github.com/org/repo`、`https://github.com/org/repo/tree/<branch>/<path>`、`.../blob/<branch>/.../SKILL.md` |
| `--id` | 资产 ID；默认取 repo 名或 path 末段 |
| `--asset-version` | 版本号，默认 `1.0.0` |
| `--out` | 输出目录；默认 `packages/guide/skill/<id>/<version>/` |
| `--path` | 仓库内 skill 子目录（覆盖 tree/blob URL 中的 path） |
| `--branch` | 克隆分支（tree/blob URL 可自动解析） |
| `--stage` / `--task` | 绑定交付阶段任务，默认 `dev` |
| `--offline` | 使用本地缓存克隆，不 fetch |
| `--skip-eval` | 跳过安装后 `hubEvalLocal` |

**行为说明**：

1. 解析 URL → `git clone` 到 `harnessX/.hub-remotes/<hash>/repo`（可复用缓存）。
2. 定位含 `SKILL.md` 的目录（根目录、`--path`、或常见 `.cursor/skills` 等）。
3. 调用 `createAssetScaffold` 生成 Hub 包，并写入 `provenance`（github-skill-install / github-repo / github-path）。
4. 默认执行 `hxhub eval --local` 等价校验；失败则中止。

**示例**：

```bash
# 整个仓库即 skill（根目录有 SKILL.md）
hxhub asset install-github git@github.com:your-org/clock-safety-skill.git \
  --id clock-safety --stage dev --task apply

# 单仓多 skill：tree URL 或 --path
hxhub asset install-github https://github.com/your-org/skills/tree/main/packages/clock \
  --id clock-safety --out ./packages/guide/skill/clock-safety/1.0.0

# 发布后走常规流程
hx asset promote ./packages/guide/skill/clock-safety/1.0.0 --to trial
hxhub promote ./packages/guide/skill/clock-safety/1.0.0 --by lin.platform
```

#### `hxhub asset info`

```bash
hxhub asset info <id>@<version> [--hub <path>]
```

输出 Hub 上已发布资产的元数据 JSON（kind、status、stage、review 状态等）。

#### `hxhub asset promote`

```bash
hxhub asset promote <id>@<version> --to <status> [--hub <path>]
```

在 **Hub 已发布包**上变更生命周期状态：`draft` \| `trial` \| `enforced` \| `deprecated` \| `archived`。

| 要点 | 说明 |
| --- | --- |
| 作用对象 | Hub 中的 `id@version`，**不是**本地目录 |
| 与 `hxhub promote <dir>` 区别 | 后者是「发布本地目录到 Hub」；本命令是「改 Hub 上已有包的状态」 |
| `enforced` 前置 | 通常须先 `hxhub review approve`；`hxhub policy check --strict` 会校验 |
| 合法转换 | 见 [§2.6](#26-资产生命周期)、[§3.4.5](#345-hub-侧trial--enforced) |

**示例**：

```bash
hxhub review approve my-skill@1.0.0 --reviewer zhao.platform
hxhub asset promote my-skill@1.0.0 --to enforced
hxhub push --message "promote: my-skill@1.0.0 to enforced"
```

> 本地目录状态变更用 `hx asset promote <dir> --to …`，见 [§3.4](#34-资产生命周期状态管理draft--trial--enforced)。

#### `hxhub asset deprecate`

```bash
hxhub asset deprecate <id>@<version> --reason <text> [--hub <path>]
```

将资产标记为 `deprecated` 并记录废弃原因。

---

### 4.14 `hxhub review` — 评审工作流

```bash
hxhub review request <id>@<version> --by <name>
hxhub review approve <id>@<version> --reviewer <name>
hxhub review reject <id>@<version> --reviewer <name> --reason <text>
```

| 子命令 | 说明 |
| --- | --- |
| `request` | 发起评审，`.review` → `pending` |
| `approve` | 批准，`.review` → `approved` |
| `reject` | 拒绝并记录原因 |

**典型流程**：`promote` 后自动 `pending` → maintainer `review approve` → `asset promote --to enforced` → `push`。

---

### 4.15 `hxhub policy check` — 治理策略检查

```bash
hxhub policy check [--strict] [--hub <path>]
```

检查 Hub 治理规则：maintainer 配置、审批门禁、`enforced` 资产是否已 approved、eval 集缺失等。`--strict` 时警告也导致非零退出码。建议纳入 Hub 仓库 CI。

---

### 4.16 `hxhub cache-gc` — 清理远端镜像缓存

```bash
hxhub cache-gc [--older-than-days <n>]
```

清理 `harnessX/.hub-remotes/` 中超过 N 天（默认 30）未使用的缓存条目。

---

### 4.17 `hxhub doctor` — 诊断

```bash
hxhub doctor [--json] [--fix-hints] [--hub <path>]
```

诊断范围：

- Hub 连接解析与角色配置
- `hub-policy.yaml` maintainer / 审批门禁
- 治理规则问题
- contributions pending 积压
- eval 集缺失
- 本地远端镜像缓存状态

`--fix-hints` 输出建议修复命令；`--json` 供自动化消费。

---

### 4.18 `hxhub fix` — 自动修复常见问题

```bash
hxhub fix [--hub <path>] [--maintainer <name>] [--json]
```

检查并修复 Hub 仓库常见问题（如缺失 `hub-policy.yaml`、maintainers 名单为空）。`--maintainer` 用于补充策略中的维护者。

---

### 4.19 `hxhub help` — AI 导向建议

```bash
hxhub help [general|api|enterprise] [--json] [--hub <path>]
```

按主题输出推荐资产、推荐原因与下一步命令建议。`--json` 供 Agent / IDE 集成。

---

## 5. 内置 Golden 资产清单

执行 `hxhub seed` 后，以下资产写入 Hub 且 `.review` 已为 `approved`，可立即消费。完整列表亦可运行 `hxhub golden` 查看。

### 5.1 Packages

| ID | 版本 | kind | stage.task | 说明 |
| --- | --- | --- | --- | --- |
| `api-conventions` | 1.0.0 | guide.skill | dev.design, dev.apply | REST 错误体、命名等 API 约定 |
| `common-review-rubrics` | 1.0.0 | sensor.rubric | dev.verify | 通用 inferential 评审规则 |
| `prd-writing` | 1.0.0 | guide.skill | dev.propose | PRD → change 需求蒸馏指引 |
| `prd-authoring` | 1.0.0 | guide.skill | req.prd-writing | 组织级 PRD 编写 |
| `arch-authoring` | 1.0.0 | guide.skill | arch.subsystem-division | 全局 HLD 编写指引 |
| `requirements-research-outline` | 1.0.0 | guide.skill | req.requirements-research | 调研提纲 |
| `prototype-wireframe` | 1.0.0 | guide.skill | dev.design | 低保真线框与原型指引 |
| `uat-checklist` | 1.0.0 | guide.template | dev.verify | UAT 签收清单模版 |

### 5.2 Bundles

| ID | 版本 | 说明 |
| --- | --- | --- |
| `api-service` | 1.0.0 | 后端 API 分层拓扑 |
| `frontend-2c` | 1.0.0 | C 端网站拓扑 |

### 5.3 Blueprints

| ID | 版本 | extends | 用途 |
| --- | --- | --- | --- |
| `enterprise-delivery` | 1.0.0 | enterprise | 企业交付全路径 |
| `enterprise-sdlc` | 1.0.0 | enterprise-sdlc | 企业 SDLC 工单驱动交付 |

### 5.4 内置拓扑 Bundle（`hx bundle list`，可发布到 Hub）

| Bundle ID | 说明 | 典型项目 |
| --- | --- | --- |
| `api-service` | 后端 API 分层 + 性能预算 | Node/Go/Java REST 服务 |
| `api-service-cn` | 同上（中文资产） | 中文团队 API 项目 |
| `frontend-2c` | C 端站点 SEO/LCP | 官网、会员门户 |
| `frontend-dashboard` | B 端后台页面/组件分层 | 运营后台 |
| `library-sdk` | 可发布 SDK | npm/pypi SDK |
| `serverless-function` | 无服务器函数 | Lambda/Cloud Functions |
| `event-consumer` | 消息/事件消费者 | Kafka/SQS 消费者 |
| `data-pipeline` | 数据管道 ETL/批流 | Spark/Flink 作业 |
| `mobile-app` | 移动端分层与离线 | iOS/Android |

---

## 6. 端到端场景指南

### 6.1 场景 A：首次建立组织 Hub（远程仓库为空）

**适用**：组织尚无 hx-hub，需从零种子化。

```bash
# 1. 种子化本地 Hub 目录
hxhub seed ./harness-hub

# 2. 重建检索索引
hxhub search --index --hub ./harness-hub

# 3. 策略检查
hxhub policy check --hub ./harness-hub --strict

# 4. 提交并推送到远程（一条命令）
hxhub seed ./harness-hub \
  --submit \
  --remote git@github.com:your-org/hx-hub.git \
  --branch main \
  --message "chore: seed harness hub golden packages"
```

**检查清单**：

- [ ] `packages/`、`bundles/`、`blueprints/` 已生成
- [ ] `hub-policy.yaml` 中 `maintainers` 包含平台负责人
- [ ] `hxhub policy check --strict` 通过
- [ ] 远程仓库可 `git clone`

---

### 6.2 场景 B：连接已有远程 Hub（运维项目初始化）

**适用**：远程 hx-hub 已存在，平台组建立独立运维仓库 `hx-hub-ops`。

#### 两个仓库的职责

| 仓库 | 作用 |
| --- | --- |
| **hx-hub**（远程已存在） | 资产本体：`packages/`、`bundles/`、`contributions/`、`hub-policy.yaml` |
| **hx-hub-ops**（新建） | 平台组工作区：执行 `promote`、`contributions accept`、`push` |

#### 步骤

```bash
# 1. 创建运维仓库
mkdir hx-hub-ops && cd hx-hub-ops
git init

# 2. 轻量初始化（推荐 hxhub init，不必 hx init）
hxhub init . \
  --hub git@github.com:your-org/hx-hub.git \
  --actor zhao.platform
```

编辑 `harnessX/roles.yaml`，确保运维人员具备 `hub.*` 权限：

```yaml
members:
  zhao.platform: chief-architect
```

```bash
# 3. 验证连接（首次会自动 git clone 到 .hub-remotes/）
hxhub search --category package
hxhub policy check --strict
hxhub contributions list

# 4. 若策略文件缺失，可自动修复
hxhub fix --maintainer zhao.platform
hxhub doctor --fix-hints
```

确认远程 `hub-policy.yaml`：

```yaml
version: "1.0"
maintainers:
  - zhao.platform
minApprovals: 1
consumerCanSubmit: true
installRequiresApproval: true
```

**检查清单**：

- [ ] `config.yaml` 中 `hub.role: maintainer` 且 `hub.actor` 已设置
- [ ] 远程 `maintainers` 包含该 actor
- [ ] `hxhub search` 能列出远程资产
- [ ] 对 hx-hub 具备 `git push` 权限

---

### 6.3 场景 C：Maintainer 发布新 Skill

**背景**：订单团队沉淀了 `idempotency-keys` Skill，平台组推广到全公司。

```bash
# === 作者在业务仓库准备资产 ===
cd orders-service
hx asset backfill harnessX/assets/guides/idempotency-keys
hx asset scan harnessX/assets/guides/idempotency-keys
hx asset promote harnessX/assets/guides/idempotency-keys --to trial

# === 平台组在 hx-hub-ops 发布 ===
cd hx-hub-ops

# 方式 1：作者有 maintainer 权限时直接 promote
hxhub promote ../orders-service/harnessX/assets/guides/idempotency-keys \
  --by wang.dev \
  --evidence "8 weeks: flaky time tests 11/mo → 0"

# 方式 2：作者为 consumer 时先 submit，见场景 E

# 评审与提升
hxhub review approve idempotency-keys@1.0.0 --reviewer zhao.platform
hxhub asset promote idempotency-keys@1.0.0 --to enforced
hxhub policy check --strict

# 可选：生成评估报告
hxhub eval idempotency-keys@1.0.0 --out /tmp/idempotency-eval.json

# 推送到远程
hxhub push --message "publish: idempotency-keys@1.0.0"
```

**或使用脚手架从零创建**（完整步骤见 §3.3）：

```bash
hxhub asset create \
  --kind guide.skill \
  --id idempotency-keys \
  --asset-version 1.0.0 \
  --status draft \
  --stage dev \
  --task apply \
  --source-dir ./drafts/idempotency-keys \
  --out ./assets/idempotency-keys

hx asset scan ./assets/idempotency-keys
hxhub promote ./assets/idempotency-keys --by zhao.platform --evidence "ci://runs/1820"
hxhub review approve idempotency-keys@1.0.0 --reviewer zhao.platform
hxhub asset promote idempotency-keys@1.0.0 --to enforced
hxhub push --message "publish: idempotency-keys@1.0.0"
```

---

### 6.4 场景 D：Consumer 安装、注册与升级

**背景**：业务仓库消费 Hub 中的 `prd-writing@1.0.0`。

`harnessX/config.yaml`：

```yaml
hub:
  source: git@github.com:your-org/hx-hub.git
  role: consumer
  actor: wang.dev
```

```bash
# 1. 安装
hxhub add prd-writing@1.0.0
hx lock write
hx lock verify

# 2. 在 harness.yaml 注册
# guides:
#   - id: prd-writing
#     kind: guide.skill
#     execution: inferential
#     stage: dev
#     task: propose
#     source: .hub-cache/prd-writing/SKILL.md

hx adapter sync

# 3. 从 Hub 初始化新项目（Bundle / Blueprint）
hx init --from-hub api-service@1.0.0 --hub git@github.com:your-org/hx-hub.git --adapter cursor
hx init --from-hub enterprise-sdlc@1.0.0 --hub git@github.com:your-org/hx-hub.git

# 4. 升级
hxhub sync                    # 查看可升级项
hxhub sync --apply            # 应用合并
hx lock write && hx lock verify

# 冲突时
hxhub sync --apply --force
# 人工解决 SKILL.md 中 <<<<<<< local 标记
hx lock write
```

---

### 6.5 场景 E：业务方贡献资产审核

**背景**：Consumer `wang.dev` 提交 Skill，Maintainer `zhao.platform` 审核。

```bash
# === 业务方（consumer 角色）===
hxhub submit ./harnessX/assets/guides/my-skill \
  --actor wang.dev \
  --evidence "used in 3 releases"

# === 平台组（maintainer 角色）===
hxhub contributions list --status pending
hxhub contributions show wang.dev/my-skill@1.0.0

hxhub contributions accept wang.dev/my-skill@1.0.0 --reviewer zhao.platform
hxhub review approve my-skill@1.0.0 --reviewer zhao.platform
hxhub asset promote my-skill@1.0.0 --to enforced
hxhub push --message "accept: my-skill@1.0.0"

# 拒绝示例
hxhub contributions reject wang.dev/bad-skill@1.0.0 \
  --reviewer zhao.platform \
  --reason "injection scan failed — remove prompt override in SKILL.md"
```

---

### 6.6 场景 F：发布 / 升级 Bundle

```bash
# 从内置 Bundle 首次发布
hxhub promote ./path/to/api-service-bundle \
  --by zhao.platform \
  --evidence "golden eval pass"
hxhub eval api-service@1.0.0 --golden minimal-api
hxhub review approve api-service@1.0.0 --reviewer zhao.platform
hxhub push --message "publish: api-service@1.0.0"
```

**升级 Bundle（1.0.0 → 1.1.0）**：

1. 更新目录内 `bundle.yaml` / 资产内容
2. 递增 `asset.yaml` 的 `version`
3. `hxhub promote` → `review approve` → `hxhub push`
4. 通知消费方对 Package 执行 `hxhub sync`（Bundle 已安装项目需重新 `hx bundle add --hub`）

---

### 6.7 场景 G：发布 / 维护 Blueprint

参考 `enterprise-sdlc@1.0.0` 结构：

```yaml
# blueprints/enterprise-sdlc/1.0.0/blueprint.yaml
name: enterprise-sdlc
extends: enterprise-sdlc
hub_deps:
  - prd-writing@1.0.0
  - uat-checklist@1.0.0
stages:
  req.requirements-research:
    guides: [requirements-research-outline]
  dev.propose:
    guides: [prd-writing]
  dev.design:
    guides: [prototype-wireframe, design-template]
  test.test-case-design:
    guides: [design-template]
  dev.verify:
    guides: [uat-checklist]
    sensors: [uat-complete, drift, bugs-closed]
```

```bash
hxhub asset create --kind harness.blueprint --id my-blueprint --asset-version 1.0.0 --out ./assets/my-blueprint
# 编辑 blueprint.yaml 后
hxhub promote ./assets/my-blueprint --by zhao.platform
hxhub review approve my-blueprint@1.0.0 --reviewer zhao.platform
hxhub push --message "publish: my-blueprint@1.0.0"

# 消费方验证
hx init --from-hub my-blueprint@1.0.0 --hub git@github.com:your-org/hx-hub.git
```

升级蓝图时**必须** semver 新版本；已初始化项目不会自动切换 profile。

---

### 6.8 场景 H：Steering 闭环发布

```bash
hx steer report
hx steer distill
hx asset backfill harnessX/assets/guides/distilled-rule
hx steer publish harnessX/assets/guides/distilled-rule \
  --hub git@github.com:your-org/hx-hub.git \
  --by author.name
# 自动执行 hub eval；draft → trial；review pending
```

---

### 6.9 场景 I：本地定制（正规出口）

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

## 7. 相关 `hx` 命令（非 hxhub，但常配合使用）

| 命令 | 说明 |
| --- | --- |
| `hx asset list [--change <id>]` | 列出已解析资产及层级 |
| `hx asset promote <dir> --to <status>` | **本地**生命周期提升（`draft`→`trial`→`enforced`）；发布 Hub 前必用 |
| `hx asset backfill <dir>` | 遥测回填 metrics（`trial`→`enforced` 门槛依赖 evaluations） |
| `hx asset scan <dir>` | 注入扫描 |
| `hx lock write` / `hx lock verify` | 锁定 / 校验哈希 |
| `hx adapter sync` | Hub/本地资产 → IDE 适配器 |
| `hx bundle list [--hub <path>]` | 拓扑 Bundle 列表 |
| `hx steer publish <dir> --hub <path>` | Steering → Hub 闭环 |

**本地状态提升示例**：

```bash
hx asset scan ./assets/my-skill
hx asset promote ./assets/my-skill --to trial
hx asset backfill ./assets/my-skill
hx asset promote ./assets/my-skill --to enforced   # 须 metrics 达标
```

本地资产发布到 Hub 前的典型路径：`hx asset promote --to trial` → `hx asset scan` → `hxhub promote`（或 `hxhub submit`）→ `hxhub review approve` → `hxhub asset promote --to enforced` → `hxhub push`。完整说明见 [§3.3](#33-资产创建与发布指南)、[§3.4](#34-资产生命周期状态管理draft--trial--enforced)。

---

## 8. CI 建议

**Hub 仓库（发布侧）**：

```yaml
- run: hxhub policy check --hub . --strict
- run: hxhub eval api-conventions@1.0.0 --hub . --golden minimal-api
```

**业务仓库（消费侧）**：

```yaml
- run: hx lock verify
- run: hxhub sync --offline          # PR 预览
- run: hx adapter drift
```

---

## 9. 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `draft assets cannot be promoted to the hub` | 本地仍为 draft | 先 `hx asset promote <dir> --to trial`（见 §3.4.2） |
| `illegal transition draft → enforced` | 状态跳级 | 经 `trial` 再升 `enforced`（见 §3.4.3） |
| `promotion blocked: needs >=5 recorded evaluations` | trial→enforced 指标不足 | `hx asset backfill` 或在 trial 阶段多运行（见 §3.4.3） |
| `hub package failed injection scan` | SKILL 含劫持指令 | `hx asset scan` 定位并删除 |
| `already published — bump the version` | 版本不可变 | 递增 `asset.yaml` version |
| `LOCK content changed since lock` | 改了 .hub-cache 未重锁 | 恢复文件或走 overrides + `hx lock write` |
| `update-and-local-changes` | 本地改过 Hub 包 | 抽 overrides 或贡献回 Hub |
| `enforced asset is not approved` | policy 检查失败 | `hxhub review approve` |
| `merge conflicts` | 同步冲突 | `hxhub sync --apply --force` 后人工合并 |
| Hub 包未进入 Context Pack | 未注册 harness.yaml | 添加 guides/sensors 条目 + `hx adapter sync` |
| `--remote required when --submit` | seed 提交缺远程 | 加 `--remote git@...` |

---

## 10. 维护检查清单（季度）

- [ ] `hxhub policy check --strict` 全绿
- [ ] `hxhub catalog rebuild` 更新 index
- [ ] 废弃包已 `asset deprecate` 并通知消费方
- [ ] `enforced` 包均有 `owner` 与评审记录
- [ ] 注入扫描红队演练（见场景 08 §5）
- [ ] Golden eval 通过（`hxhub eval --golden`）
- [ ] 消费方 `harness.lock` 漂移审计

---

## 11. 与 `hx hub` 的关系

- `hx hub <cmd>` 与 `hxhub <cmd>` 共享同一实现（`registerHubCommands`）。
- 新运维项目建议优先使用 `hxhub`；已有项目可渐进迁移。
- 仅 `hxhub` 提供的命令：`init`、`help`、`doctor`、`fix`。
- 仅 `hx hub` 提供的别名：`approve`（`review approve` 简写）、`cache gc`（`cache-gc` 简写）。

---

## 12. 延伸阅读

- [§3.3 资产创建与发布（指南）](#33-资产创建与发布指南)
- [§3.4 资产生命周期状态管理（draft → trial → enforced）](#34-资产生命周期状态管理draft--trial--enforced)
- [操作说明 §9.1 Hub 资产管理](operation-guide.zh-CN.md#91-hub-资产管理命令本次升级新增)
- [场景 08：Hub 供应链](examples/08-hub-资产共享与供应链.md)
- [场景 16：Hub 蓝图初始化](examples/16-v0.3-hub-blueprint-init.md)
- [场景 21：双角色与贡献审核](examples/21-hub-双角色与贡献审核.md)
- [packages/hub-golden/README.md](../packages/hub-golden/README.md)
