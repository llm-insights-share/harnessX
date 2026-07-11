# 产品经理需求文档编写使用手册

**适用角色**：产品经理（PM）、业务分析师（BA）  
**适用阶段**：`req`（需求阶段，组织级）  
**版本**：HarnessX v0.6+  
**关联文档**：[操作说明 §4 需求阶段](operation-guide.zh-CN.md) · [交付阶段权威定义](delivery-stages.zh-CN.md) · [场景 19 组织级 PRD](examples/19-组织级PRD与架构设计.md) · [场景 11 自定义需求模板](examples/11-自定义需求产出模板.md)

---

## 1. 概述与定位

本手册说明产品经理如何使用 HarnessX 编写、校验与批准**组织级产品需求文档（PRD）**。

HarnessX 将 PRD 维护为组织级真相源，与单次功能交付的 change 工作区分离：

| 层级 | 路径 | 维护者 | 生命周期 |
| --- | --- | --- | --- |
| **组织级 PRD** | `docs/prd/<slug>.md` | 产品经理 | 跨多个 change 复用 |
| **change 级需求** | `harnessX/changes/<id>/requirements/` | 研发（propose 阶段蒸馏） | 单次交付 |

**操作分工原则**：

| 入口 | 适用操作 | 示例 |
| --- | --- | --- |
| **IDE（Cursor 等）** | 编写 PRD 正文、调研笔记 | `/hx-req-prd-writing` |
| **终端 CLI** | 脚手架、门禁检查、人工批准 | `hx req prd check`、`hx approve prd` |

> 经验法则：**写文档走 IDE；批准与审计走终端。**

---

## 2. 核心概念

### 2.1 req 阶段任务

| 任务 ID | 必选 | 说明 | 典型能力 |
| --- | --- | --- | --- |
| `biz-understanding` | 否 | 业务理解 | guide `requirements-research-outline` |
| `requirements-research` | 否 | 需求调研（只读） | `/hx-req-requirements-research` |
| `requirements-analysis` | 是 | 需求分析 | sensor `requirements-complete` |
| `prototype-design` | 是 | 产品原型设计 | guide `prototype-wireframe` |
| `prd-writing` | 是 | PRD 编写 | `hx req prd`、`prd-complete`、`prd-approved` |

日常 PM 工作以 **`prd-writing`** 为核心；复杂需求可先走可选的 `requirements-research`。

### 2.2 门禁与传感器

| 传感器 | 触发时机 | 含义 |
| --- | --- | --- |
| `prd-complete` | `hx req prd check` | PRD 结构完整（用户故事、AC、范围、NFR、评审结论等） |
| `prd-approved` | dev `propose`（enterprise） | PRD 已通过人工批准，且与当前文件内容哈希一致 |

**批准与内容绑定**：修改 `docs/prd/<slug>.md` 后，原批准记录失效，须重新执行 `hx req prd check` + `hx approve prd`。

### 2.3 Profile 差异

| Profile | 是否走 req 阶段 |
| --- | --- |
| `lite` | 否（跳过 req/arch，直接进入 dev） |
| `standard` / `strict` / `enterprise` / `enterprise-sdlc` | 是 |

本手册默认 **`enterprise` 或 `enterprise-sdlc`** 场景。

---

## 3. 环境与前置条件

### 3.1 环境准备

```bash
cd <your-repo>
npm install
```

`hx` 指 `node bin/hx.js` 或全局安装后的 `hx` 命令。

### 3.2 项目已初始化

通常由技术负责人完成；PM 需确认仓库存在 `harnessX/` 目录：

```bash
hx init --bundle frontend-dashboard   # 示例；亦可 enterprise 蓝图
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
| 斜杠命令 | `.cursor/commands/hx-req-*.md` |
| Skill | `.cursor/skills/prd-authoring/SKILL.md` |
| 规则 | `.cursor/rules/harnessx.mdc` |

> **命名说明**：文档与旧版 prompt 常写作 `/hx-prd`、`/hx-explore`；adapter 实际生成的命令名为 `/hx-req-prd-writing`、`/hx-req-requirements-research`（规则：`hx-{stage}-{task}`）。

---

## 4. 端到端工作流程

```mermaid
flowchart LR
  A["可选: 需求调研"] --> B["初始化 PRD"]
  B --> C["IDE 编写 PRD"]
  C --> D["CLI 门禁检查"]
  D --> E["终端人工批准"]
  E --> F["通知研发创建 change"]
```

**推荐顺序**：

1. （可选）需求调研  
2. `hx req prd init` 脚手架  
3. Cursor `/hx-req-prd-writing` 填写正文  
4. `hx req prd check` 直至 PASS  
5. `hx approve prd` 人工批准  
6. 通知研发 `hx change create --prd <slug>`

---

## 5. 操作步骤

以下以 PRD slug **`member-badge`**（会员徽章）为例。

### 5.1 步骤 0（可选）：需求调研

适用于复杂需求、需先摸清现状再写 PRD 的场景。

**IDE 执行语句：**

```text
Cursor ▸ /hx-req-requirements-research
         （文档旧称 /hx-explore）

         调研主题：会员徽章展示的业务现状与约束
         参考：@docs/ 下已有文档、相关业务模块代码（只读）
         产出：调研结论供后续 PRD 引用
```

**配合 CLI（如需脚手架调研笔记）：**

```bash
hx change create member-badge-research --domains member
hx explore member-badge-research --topic "会员徽章展示现状调研"
```

**约束**：此阶段为 **READ-ONLY**，不编写 PRD、不修改代码或规格。

---

### 5.2 步骤 1：初始化 PRD 脚手架

**终端 CLI：**

```bash
hx req prd init member-badge --title "会员徽章"
```

**期望输出：**

```text
Wrote docs/prd/member-badge.md
```

脚手架基于 `prd-template`，包含：业务背景、In/Out Scope、用户故事表、验收标准（GWT）、NFR、评审结论等章节。

**查看已有 PRD：**

```bash
hx req prd list
```

---

### 5.3 步骤 2：在 IDE 中编写 PRD（核心步骤）

**IDE 执行语句：**

```text
Cursor ▸ /hx-req-prd-writing
         （文档旧称 /hx-prd）

         slug：member-badge
         请按 prd-authoring Skill 填写 docs/prd/member-badge.md

         业务背景：会员在个人中心需要展示等级徽章
         参考：@docs/ 下相关文档（如有）
```

**编写规范（prd-authoring Skill）**：

1. 每个功能至少 1 条用户故事（`US-xxx`）和验收标准（`AC-xxx`）
2. 验收标准使用 **Given / When / Then**
3. 明确区分 **In Scope** 与 **Out of Scope**
4. NFR 须可量化（延迟、可用性、安全等）
5. 填写 **评审结论** 章节

**正文示例片段：**

```markdown
## 用户故事
| ID | 作为 | 我希望 | 以便 | 优先级 |
| US-001 | 会员用户 | 在个人中心看到我的等级徽章 | 了解当前会员身份 | P0 |

## 验收标准
| AC ID | Given | When | Then | 用户故事 |
| AC-001 | 用户已登录且为金牌会员 | 打开个人中心 | 显示金色徽章图标 | US-001 |

## 范围定义
### In Scope
- 个人中心徽章展示

### Out of Scope
- 徽章分享、徽章商城
```

**Agent 权限约束**：

- 仅可编辑 `docs/prd/**`
- 不得创建 change、delta spec 或实现代码
- 不确定的需求写入「开放问题」，不得臆造

**可选：导出 Context Pack**

```bash
hx guide prd-pack member-badge
hx guide prd-pack member-badge --out /tmp/member-badge-prd-pack.md
```

---

### 5.4 步骤 3（可选）：产品原型设计

若 PRD 需补充线框或原型说明：

**IDE 执行语句：**

```text
Cursor ▸ /hx-req-prototype-design

         为 member-badge PRD 补充原型线框说明
         目标：docs/prd/member-badge.md 内原型相关章节
```

---

### 5.5 步骤 4：门禁检查

编写或修改 PRD 后，在终端执行：

```bash
hx req prd check member-badge
```

**通过示例：**

```text
PASS  prd-complete: PRD complete
```

**失败示例：**

```text
FAIL  prd-complete: missing user stories / AC / review conclusion
```

按报错补全后重跑，直至 `PASS`。

**IDE 辅助（可选）：**

```text
Cursor ▸ 请运行 hx req prd check member-badge，把输出贴回对话；
         若 FAIL，按提示修改 docs/prd/member-badge.md 后重跑直到 PASS。
```

---

### 5.6 步骤 5：人工批准（必须在终端）

PRD 检查通过后，PM 或指定审批人在终端批准：

```bash
hx approve prd member-badge --approver chen.pm
```

或完整写法：

```bash
hx gate approve --gate prd --prd member-badge --approver chen.pm
```

**期望输出：**

```text
approved PRD "member-badge" by chen.pm (artifact a1b2c3d4e5f6)
```

批准记录写入 `docs/.stage-approvals.yaml`，与 PRD 文件内容哈希绑定。

> **注意**：此步骤必须由人工在终端执行，Agent 不得代跑 `hx approve` / `hx gate approve`。

---

### 5.7 步骤 6（可选）：提交审核工单

`enterprise-sdlc` profile 可提交正式审核工单：

```bash
hx req prd submit member-badge --by chen.pm
```

---

### 5.8 步骤 7：查看 req 阶段进度

```bash
hx req status
# 或
hx stage status --stage req
```

---

## 6. 与研发交接

PRD 批准通过后，通知研发创建 change（通常由研发执行）：

```bash
hx change create member-badge \
  --domains member \
  --profile enterprise \
  --prd member-badge \
  --arch-modules member
```

| 参数 | 含义 |
| --- | --- |
| `--prd <slug>` | 链接组织级 PRD，Context Pack 自动注入 |
| `--domains` | 声明触及的能力域，与架构 `registry.yaml` 对齐 |
| `--arch-modules` | 链接组织级模块 LLD（架构师维护后可用） |

后续研发在 dev `propose` 阶段会将 org PRD **蒸馏**到 change 的 `requirements/`。完整 change 交付见 [场景 15](examples/15-企业级需求到交付交接.md)。

**协作顺序（enterprise 推荐）**：

```text
PM：PRD 批准 → 架构师：HLD/LLD 批准 → 研发：change create → dev 交付
```

---

## 7. 命令速查

### 7.1 CLI 命令

| 命令 | 选项 | 含义 |
| --- | --- | --- |
| `req status` | — | 列出 req 阶段任务及完成状态 |
| `req prd init <slug>` | `--title <title>` | 脚手架 `docs/prd/<slug>.md` |
| `req prd check <slug>` | — | 运行 `prd-complete` sensor |
| `req prd list` | — | 列出已有 PRD slug |
| `req prd submit <slug>` | `--by <name>`, `--title <title>` | 提交 PRD 审核工单（enterprise-sdlc） |
| `approve prd <slug>` | `--approver <name>` | PRD 批准简写 |
| `gate approve` | `--gate prd`, `--approver <name>`, `--prd <slug>` | PRD 批准（完整写法） |
| `guide prd-pack <slug>` | `--out <file>` | 输出 PRD Context Pack |
| `stage status` | `--stage req` | 查看 req 阶段任务进度 |

### 7.2 IDE 斜杠命令

| 文档旧称 | adapter 实际命令 | 绑定任务 | 用途 |
| --- | --- | --- | --- |
| `/hx-explore` | `/hx-req-requirements-research` | `requirements-research` | 只读需求调研 |
| `/hx-prd` | `/hx-req-prd-writing` | `prd-writing` | 组织级 PRD 编写 |
| — | `/hx-req-prototype-design` | `prototype-design` | 产品原型设计 |
| — | `/hx-req-requirements-analysis` | `requirements-analysis` | 需求分析 |
| — | `/hx-req-biz-understanding` | `biz-understanding` | 业务理解 |

### 7.3 绑定 Skill

| Skill | 绑定任务 | 要点 |
| --- | --- | --- |
| `prd-authoring` | `prd-writing` | 用户故事、GWT、范围、NFR、评审结论 |
| `prd-template` | `prd-writing` | init 脚手架结构 |
| `requirements-research-outline` | `biz-understanding` / `requirements-research` | 调研提纲（Hub 资产） |
| `prototype-wireframe` | `prototype-design` | 原型线框（Hub 资产） |

---

## 8. 日常最小操作集

```bash
# 1. 新建 PRD
hx req prd init <slug> --title "<标题>"

# 2. 在 Cursor 使用 /hx-req-prd-writing 编写正文

# 3. 检查
hx req prd check <slug>

# 4. 批准（终端人工）
hx approve prd <slug> --approver <你的名字>

# 5. 查看状态
hx req status
hx req prd list
```

---

## 9. 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| Cursor 里没有 `/hx-prd` | 未执行 adapter sync | `hx adapter sync --targets cursor`；实际命令名可能为 `/hx-req-prd-writing` |
| `hx req prd check` 失败 | PRD 章节不完整 | 补全用户故事、AC（GWT）、In/Out Scope、NFR、评审结论 |
| 研发 propose 被拦：`PRD not approved` | 未批准或批准后修改了 PRD | 重新 `hx req prd check` + `hx approve prd` |
| PRD 修改后研发再次被拦 | 批准与内容哈希绑定 | 同上：check + approve |
| Agent 创建了 change 或写了代码 | 违反 req 阶段权限 | 撤销无关改动；仅用 `/hx-req-prd-writing` 编辑 `docs/prd/**` |

---

## 10. 延伸阅读

| 文档 | 内容 |
| --- | --- |
| [场景 19：组织级 PRD 与架构](examples/19-组织级PRD与架构设计.md) | PRD + 架构完整 walkthrough |
| [场景 11：自定义需求模板](examples/11-自定义需求产出模板.md) | 定制 `prd-template` |
| [操作说明 §4](operation-guide.zh-CN.md) | req 阶段命令参数详情 |
| [架构师概要设计使用手册](arch-hld-manual.zh-CN.md) | PRD 批准后的架构阶段 |
| [使用说明 §1.7](usage-guide.zh-CN.md) | PM 典型场景摘要 |
