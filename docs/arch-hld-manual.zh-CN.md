# 架构师概要设计使用手册

**适用角色**：架构师、技术负责人、概要设计（HLD）负责人  
**适用阶段**：`arch`（设计阶段，组织级）  
**版本**：HarnessX v0.6+  
**关联文档**：[操作说明 §5 设计阶段](operation-guide.zh-CN.md) · [交付阶段权威定义](delivery-stages.zh-CN.md) · [场景 19 组织级 PRD 与架构](examples/19-组织级PRD与架构设计.md) · [场景 12 自定义概要设计模板](examples/12-自定义概要设计产出模板.md)

---

## 1. 概述与定位

本手册说明架构师如何使用 HarnessX 编写、校验与批准**组织级概要设计（HLD）**及**模块详细设计（LLD）**。

HarnessX 将架构维护为组织级真相源，与单次 change 的 `design/` 分离：

| 层级 | 路径 | 维护者 | 生命周期 |
| --- | --- | --- | --- |
| **全局 HLD（概要设计）** | `docs/architecture/overview.md` | 架构师 | 描述系统整体形态 |
| **模块注册表** | `docs/architecture/registry.yaml` | 架构师 | 模块 id、capabilities、LLD 路径 |
| **模块 LLD** | `docs/architecture/modules/<module>/lld.md` | 架构师 | 模块级接口契约与 ADR |
| **change 级设计** | `harnessX/changes/<id>/design/` | 研发（dev `design`） | 本次改动如何融入系统 |

**双轨设计原则**：

- **org 架构**（`docs/architecture/`）：系统长什么样  
- **change 设计**（`changes/<id>/design/`）：本次改动如何对齐 org 架构  

**操作分工原则**：

| 入口 | 适用操作 | 示例 |
| --- | --- | --- |
| **IDE（Cursor 等）** | 编写 HLD、LLD 正文 | `/hx-arch-subsystem-division` |
| **终端 CLI** | 脚手架、门禁检查、人工批准、沉淀 | `hx arch check`、`hx approve arch`、`hx arch promote` |

> 经验法则：**写设计走 IDE；批准、沉淀、归档走终端。**

---

## 2. 核心概念

### 2.1 arch 阶段任务

| 任务 ID | 必选 | 说明 | 典型能力 |
| --- | --- | --- | --- |
| `subsystem-division` | 是 | 子系统划分（全局 HLD） | `hx arch init`、`arch-hld-complete` |
| `tech-selection` | 是 | 技术选型 | `overview.md` 相关章节 |
| `database-design` | 是 | 数据库设计 | HLD / LLD 章节 |
| `interface-design` | 是 | 接口设计（外部/系统间） | HLD 章节 |
| `key-mechanisms` | 否 | 关键设计机制 | ADR、`hx waiver` |
| `internal-interface` | 是 | 内部接口设计（模块 LLD） | `hx arch lld`、`arch-lld-complete`、`arch-lld-approved` |

日常架构师工作以 **`subsystem-division`（全局 HLD）** 与 **`internal-interface`（模块 LLD）** 为核心。

### 2.2 门禁与传感器

| 传感器 | 触发时机 | 含义 |
| --- | --- | --- |
| `arch-hld-complete` | `hx arch check` | 全局 HLD 结构完整 |
| `arch-approved` | `hx arch check` / dev `design` | 全局 HLD 已人工批准 |
| `arch-lld-complete` | `hx arch lld check` | 模块 LLD 结构完整 |
| `arch-lld-approved` | dev `design`（enterprise） | 模块 LLD 已人工批准 |
| `arch-change-align` | dev `design` | change 触及域与 org 模块 LLD 对齐 |
| `arch-drift` | dev `verify` | change 设计与 org LLD 漂移（未 promote 时可能 warn） |

**批准与内容绑定**：修改 `overview.md` 或模块 `lld.md` 后，原批准记录失效，须重新 check + approve。

### 2.3 Profile 差异

| Profile | 是否走 arch 阶段 |
| --- | --- |
| `lite` | 否 |
| `standard` / `strict` / `enterprise` / `enterprise-sdlc` | 是 |

本手册默认 **`enterprise` 或 `enterprise-sdlc`** 场景。

---

## 3. 环境与前置条件

### 3.1 环境准备

```bash
cd <your-repo>
npm install
```

### 3.2 项目已初始化

```bash
hx init --bundle api-service   # 示例；亦可 enterprise 蓝图
```

`config.yaml` 建议：

```yaml
profile: enterprise
adapter:
  target: cursor
```

### 3.3 同步 IDE 适配器（必须）

```bash
hx adapter sync --targets cursor
```

同步后 Cursor 可用：

| 类型 | 路径 / 名称 |
| --- | --- |
| 斜杠命令 | `.cursor/commands/hx-arch-*.md` |
| Skill | `.cursor/skills/arch-authoring/`、`arch-module-boundary/` |
| 规则 | `.cursor/rules/harnessx.mdc` |

> **命名说明**：文档旧称 `/hx-arch`、`/hx-arch-lld`；adapter 实际命令名为 `/hx-arch-subsystem-division`、`/hx-arch-internal-interface`。

### 3.4 建议前置：PRD 已批准

enterprise 推荐协作顺序为 **PRD 批准 → HLD 批准 → 模块 LLD 就绪 → change create**。

```bash
hx req prd list
hx req prd check member-badge   # 可选确认
```

---

## 4. 端到端工作流程

```mermaid
flowchart LR
  A["初始化全局 HLD"] --> B["IDE 编写概要设计"]
  B --> C["CLI 门禁检查"]
  C --> D["终端批准 HLD"]
  D --> E["初始化模块 LLD"]
  E --> F["IDE 编写模块设计"]
  F --> G["CLI 检查 + 批准 LLD"]
  G --> H["通知研发创建 change"]
  H --> I["change 交付中审阅对齐"]
  I --> J["archive 前 hx arch promote"]
```

---

## 5. 操作步骤

以下以「会员电商」全局架构 + `member` 模块为例。

### 5.1 步骤 1：初始化全局 HLD 脚手架

**终端 CLI：**

```bash
hx arch init --title "会员电商"
```

**期望输出：**

```text
Wrote docs/architecture/overview.md
Wrote docs/architecture/registry.yaml
```

脚手架基于 `arch-hld-template`，包含：系统边界、模块职责表、数据流、NFR、ADR、风险清单等。

---

### 5.2 步骤 2：在 IDE 中编写全局概要设计（核心步骤）

**IDE 执行语句：**

```text
Cursor ▸ /hx-arch-subsystem-division
         （文档旧称 /hx-arch）

         系统：会员电商
         请按 arch-authoring Skill 填写：
         - docs/architecture/overview.md（全局 HLD）
         - docs/architecture/registry.yaml（模块注册表）

         参考已批准 PRD：@docs/prd/member-badge.md
         需划分模块：member、order、payment
```

**编写规范（arch-authoring Skill）**：

1. 定义系统边界与上下游系统
2. 模块表须列出职责、输入、输出、约束
3. ADR 记录 Decision、Alternatives、Consequences
4. `registry.yaml` 与模块表保持同步
5. 每个模块映射到 `capabilities`（与 change `--domains` 对齐）

**概要设计正文示例片段：**

```markdown
## 架构方案与模块划分
| 模块 | 职责 | 输入 | 输出 | 关键约束 |
| member | 会员身份与徽章 | 用户事件 | 会员档案 | 核心域 |

## ADR
### ADR-001 徽章展示采用 BFF 聚合
- Decision: 个人中心页由 BFF 聚合 member 服务
- Alternatives: 前端直连 member API
- Consequences: 降低前端耦合，BFF 需缓存策略
```

**同步维护 `registry.yaml`：**

```yaml
modules:
  - id: member
    title: 会员模块
    status: active
    capabilities: [member]
    owner: lin.arch
    lld: docs/architecture/modules/member/lld.md
```

**Agent 权限约束**：

- 可编辑 `docs/architecture/overview.md`、`registry.yaml`、`adr/**`
- 不得创建 change、change 级 design 或实现代码

**可选：导出架构 Context Pack**

```bash
hx guide arch-pack
hx guide arch-pack --module member --out /tmp/member-arch-pack.md
```

---

### 5.3 步骤 3（可选）：补充 arch 其他任务章节

可在步骤 2 中一并写入 `overview.md`，或使用对应斜杠命令：

| 任务 | IDE 斜杠命令（adapter 实际名） |
| --- | --- |
| 技术选型 | `/hx-arch-tech-selection` |
| 数据库设计 | `/hx-arch-database-design` |
| 接口设计（外部/系统间） | `/hx-arch-interface-design` |
| 关键设计机制（可选） | `/hx-arch-key-mechanisms` |

**IDE 示例：**

```text
Cursor ▸ /hx-arch-interface-design

         在 docs/architecture/overview.md 补充外部接口设计：
         - 会员查询 API（REST）
         - 与支付系统的事件契约
```

---

### 5.4 步骤 4：全局 HLD 门禁检查

**终端 CLI：**

```bash
hx arch check
```

**首次可能输出（HLD 未批准）：**

```text
BLOCKER  arch-approved: global architecture not approved
```

补全 `overview.md` 与 `registry.yaml` 后重跑，直至：

```text
GATE PASS
```

**IDE 辅助（可选）：**

```text
Cursor ▸ 请运行 hx arch check，把 BLOCKER/WARNING 贴回对话；
         按提示修改 docs/architecture/ 后重跑直到 GATE PASS。
```

---

### 5.5 步骤 5：人工批准全局 HLD（必须在终端）

```bash
hx approve arch --approver lin.arch
```

或完整写法：

```bash
hx gate approve --gate arch --approver lin.arch
```

**期望输出：**

```text
approved global arch by lin.arch (artifact a1b2c3d4e5f6)
```

批准记录写入 `docs/.stage-approvals.yaml`。

> **注意**：必须由人工在终端执行，Agent 不得代跑批准命令。

---

### 5.6 步骤 6：初始化并编写模块 LLD

对每个关键模块（id 与 `registry.yaml` 一致）：

**终端 CLI：**

```bash
hx arch lld init member --title "会员模块"
```

**IDE 执行语句：**

```text
Cursor ▸ /hx-arch-internal-interface
         （文档旧称 /hx-arch-lld）

         模块：member
         请按 arch-module-boundary Skill 填写
         docs/architecture/modules/member/lld.md

         对齐全局 HLD：@docs/architecture/overview.md
         对齐 PRD：@docs/prd/member-badge.md
```

LLD 通常包含：组件划分、接口契约（IF-xxx）、数据模型、关键流程、错误处理、安全约束。

**检查模块 LLD：**

```bash
hx arch lld check member
# 检查所有 active 模块
hx arch lld check --all
```

**通过示例：**

```text
PASS  member
```

**批准模块 LLD（终端）：**

```bash
hx approve arch-lld member --approver lin.arch
# 或
hx gate approve --gate arch-lld --module member --approver lin.arch
```

---

### 5.7 步骤 7（可选）：提交概要设计审核工单

`enterprise-sdlc` profile：

```bash
hx arch submit --by lin.arch
# 关联 change 时
hx arch submit --by lin.arch --change member-badge
```

---

### 5.8 步骤 8：查看 arch 阶段进度

```bash
hx stage status --stage arch
hx arch list
```

`hx arch list` 输出示例：

```text
member	active	[member]
order	active	[order]
```

---

## 6. 与研发交接

架构制品就绪后，通知研发创建 change：

```bash
hx change create member-badge \
  --domains member \
  --profile enterprise \
  --prd member-badge \
  --arch-modules member
```

| 参数 | 含义 |
| --- | --- |
| `--domains` | 触及能力域，须与 `registry.yaml` 的 `capabilities` 一致 |
| `--arch-modules` | 链接模块 LLD，Context Pack 在 propose/design 自动注入 |

`meta.yaml` 记录 `prdRef` 与 `archModules`；研发无需每次手动 `@` org 制品。

---

## 7. change 交付中的架构师触点

概要设计批准后，架构师在 change 交付中通常参与以下环节：

| dev 任务 | 架构师动作 | CLI / 说明 |
| --- | --- | --- |
| `design` | 审阅 change 的 `design/overview.md` 与 LLD 目录是否与 org HLD 对齐 | `hx arch align <change>`（诊断） |
| `design` | enterprise 门禁检查 `arch-approved`、`arch-change-align` | 研发跑 `hx gate check <change> --stage dev --task design` |
| `verify` | 关注 `arch-drift`（未 promote 时可能 warn） | — |
| **archive 前** | **必须**将 change design 沉淀回 org 模块 LLD | `hx arch promote <change> --by lin.arch` |

### 7.1 设计对齐诊断

```bash
hx arch align member-badge
```

用于检查 change 触及域是否映射到 org 模块 LLD。

### 7.2 归档前沉淀（enterprise 必需）

change 验证通过后：

```bash
# 可选先预览
hx arch promote member-badge --by lin.arch --dry-run

# 正式沉淀
hx arch promote member-badge --by lin.arch
```

**期望输出：**

```text
promoted change "member-badge" → modules [member]
  updated docs/architecture/modules/member/lld.md
```

结构化合并：API 表行写入模块 LLD 接口契约表；ADR 与设计摘要写入 `## Promoted from change` 节。

未执行 `hx arch promote` 时，enterprise **archive 会被阻断**（可用 waiver 豁免，见 [场景 15](examples/15-企业级需求到交付交接.md)）。

---

## 8. 命令速查

### 8.1 CLI 命令

| 命令 | 选项 | 含义 |
| --- | --- | --- |
| `arch init` | `--title <title>` | 脚手架全局 HLD + `registry.yaml` |
| `arch check` | — | 运行 `arch-check` 套件 |
| `arch list` | — | 列出 registry 中模块 |
| `arch lld init <module>` | `--title <title>` | 脚手架模块 LLD |
| `arch lld check <module>` | — | 校验指定模块 LLD |
| `arch lld check` | `--all` | 校验所有 active 模块 |
| `arch submit` | `--by <name>`, `--change <id>`, `--title <title>` | 提交架构审核工单 |
| `arch align <change>` | — | change 与 org 架构对齐诊断 |
| `arch promote <change>` | `--by <name>`, `--dry-run` | 将 change design 沉淀到模块 LLD |
| `approve arch` | `--approver <name>` | 批准全局 HLD |
| `approve arch-lld <module>` | `--approver <name>` | 批准模块 LLD |
| `gate approve` | `--gate arch` / `arch-lld`, `--approver`, `--module` | 批准（完整写法） |
| `guide arch-pack` | `--module <id>`, `--out <file>` | 输出架构 Context Pack |
| `stage status` | `--stage arch` | 查看 arch 阶段任务进度 |

### 8.2 IDE 斜杠命令

| 文档旧称 | adapter 实际命令 | 绑定任务 | 用途 |
| --- | --- | --- | --- |
| `/hx-arch` | `/hx-arch-subsystem-division` | `subsystem-division` | 全局 HLD + registry |
| `/hx-arch-lld` | `/hx-arch-internal-interface` | `internal-interface` | 模块 LLD |
| — | `/hx-arch-tech-selection` | `tech-selection` | 技术选型 |
| — | `/hx-arch-database-design` | `database-design` | 数据库设计 |
| — | `/hx-arch-interface-design` | `interface-design` | 外部/系统间接口 |
| — | `/hx-arch-key-mechanisms` | `key-mechanisms` | 关键设计机制（可选） |

### 8.3 绑定 Skill

| Skill | 绑定任务 | 要点 |
| --- | --- | --- |
| `arch-authoring` | `subsystem-division` | 系统边界、模块表、ADR、registry 同步 |
| `arch-hld-template` | `subsystem-division` | init 脚手架结构 |
| `arch-module-boundary` | `internal-interface` | 模块边界、接口契约 |
| `arch-lld-template` | `internal-interface` | 模块 LLD 脚手架 |

---

## 9. 日常最小操作集

```bash
# 1. 初始化全局概要设计
hx arch init --title "会员电商"

# 2. 在 Cursor 使用 /hx-arch-subsystem-division 编写 HLD

# 3. 检查 + 批准全局 HLD
hx arch check
hx approve arch --approver lin.arch

# 4. 初始化 + 编写模块 LLD（Cursor：/hx-arch-internal-interface）
hx arch lld init member --title "会员模块"
hx arch lld check member
hx approve arch-lld member --approver lin.arch

# 5. 查看状态
hx arch list
hx stage status --stage arch

# 6. change 归档前沉淀（enterprise）
hx arch promote <change> --by lin.arch
```

---

## 10. 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| Cursor 里没有 `/hx-arch` | 未执行 adapter sync | `hx adapter sync --targets cursor`；实际命令名可能为 `/hx-arch-subsystem-division` |
| `hx arch check` BLOCKER: `arch-approved` | HLD 未批准 | 补全 HLD 后 `hx approve arch` |
| 研发 dev `design` 被拦：`global architecture not approved` | 全局 HLD 未批准 | `hx approve arch --approver <name>` |
| `arch-change-align` 失败 | change `--domains` 与 registry `capabilities` 不一致 | 修正 `registry.yaml` 或 change 域声明 |
| archive 被拦：需要 `hx arch promote` | enterprise 要求沉淀 | verify 通过后 `hx arch promote <change>` |
| 修改 HLD/LLD 后研发再次被拦 | 批准与内容哈希绑定 | 重新 check + approve |
| `arch-drift` warn | change design 未 promote 到 org LLD | archive 前执行 `hx arch promote` |

---

## 11. 延伸阅读

| 文档 | 内容 |
| --- | --- |
| [场景 19：组织级 PRD 与架构](examples/19-组织级PRD与架构设计.md) | PRD + 架构完整 walkthrough |
| [场景 12：自定义概要设计模板](examples/12-自定义概要设计产出模板.md) | 定制 `arch-hld-template` |
| [场景 15：enterprise 交接](examples/15-企业级需求到交付交接.md) | change 内 design 与 `hx arch promote` |
| [操作说明 §5](operation-guide.zh-CN.md) | arch 阶段命令参数详情 |
| [产品经理需求文档编写使用手册](pm-req-manual.zh-CN.md) | PRD 阶段（arch 前置） |
| [使用说明 §1.8](usage-guide.zh-CN.md) | 架构师典型场景摘要 |
