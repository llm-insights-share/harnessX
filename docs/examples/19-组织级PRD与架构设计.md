# 场景 19：组织级 PRD 与全局架构（/hx-prd、/hx-arch）

| | |
| --- | --- |
| **旅程** | 企业交付 · req/arch 阶段 |
| **适用角色** | 产品（陈产品）、架构师（林架构） |
| **前置** | [场景 01](01-新项目接入.md)（`hx init`、`hx adapter sync`） |
| **后续** | [场景 15](15-企业级需求到交付交接.md)（`change create` 后进入 propose→archive） |

## 背景

**RetailCo** 在每次 enterprise change 之前，先把「组织级真相源」写在仓库根目录：

| 层级 | 路径 | 谁维护 |
| --- | --- | --- |
| PRD | `docs/prd/<slug>.md` | 产品 |
| 全局 HLD | `docs/architecture/overview.md` + `registry.yaml` | 架构师 |
| 模块 LLD | `docs/architecture/modules/<module>/lld.md` | 架构师 |

单次 change 的 `requirements/`、`design/` 是对上述制品的**蒸馏与增量**；验证通过后 `hx arch promote` 将 change design **沉淀回**模块 LLD。

## 1. PRD — `/hx-prd`

```text
Cursor ▸ /hx-prd
         目标 slug：member-badge
```

```console
$ hx req prd init member-badge --title "会员徽章"
Wrote docs/prd/member-badge.md

$ hx req prd check member-badge
PASS  prd-complete: PRD complete
```

陈产品填写用户故事、AC（GWT）、In/Out Scope、NFR、评审结论后再次 `hx req prd check`。

**人工批准**（终端，非 Agent）：

```console
$ hx approve prd member-badge --approver chen.pm
approved PRD "member-badge" by chen.pm (artifact a1b2c3d4e5f6)
```

批准记录写入 `docs/.stage-approvals.yaml`，并与 PRD 文件内容哈希绑定；PRD 改动后需重新批准。

## 2. 全局架构 — `/hx-arch`

```console
$ hx arch init --title "会员电商"
Wrote docs/architecture/overview.md
Wrote docs/architecture/registry.yaml

$ hx arch check
BLOCKER  arch-approved: global architecture not approved
```

林架构补全 overview 各章节与 registry 模块表后：

```console
$ hx arch check
GATE PASS

$ hx approve arch --approver lin.arch
approved global arch by lin.arch (artifact ...)
```

## 3. 模块 LLD — `/hx-arch-lld`

```console
$ hx arch lld init member --title "会员模块"
Wrote docs/architecture/modules/member/lld.md

$ hx arch lld check member
PASS  arch-lld-complete: module LLD complete
```

在 `registry.yaml` 中为 `member` 模块声明 `capabilities: [member]`，与后续 change 的 `--domains member` 对齐。

## 4. 创建 change（衔接场景 15）

```console
$ hx change create member-badge \
    --domains member \
    --profile enterprise \
    --prd member-badge \
    --arch-modules member
```

`meta.yaml` 记录 `prdRef` 与 `archModules`；后续 `/hx-propose`、`/hx-design` 的 Context Pack **自动注入** org PRD 与模块 LLD（无需每次手动 `@`）。

## 5. 与 change 交付的衔接

| dev/test 任务 | 组织级检查 | change 级制品 |
| --- | --- | --- |
| dev:propose | `prd-complete` + `prd-approved` | `requirements/`、`proposal.md`、delta spec |
| dev:design | `arch-approved` + `arch-change-align` | `design/overview.md` + LLD 目录 |
| dev:verify | `arch-drift`（未 promote 时 warn） | 测试 + traceability |
| archive 前 | — | **`hx arch promote <change>`**（enterprise 必需，除非 waiver） |

完整 change  walkthrough 见 [场景 15](15-企业级需求到交付交接.md)。

## 6. 沉淀 — `hx arch promote`

```console
$ hx arch promote member-badge --by lin.arch
promoted change "member-badge" → modules [member]
  updated docs/architecture/modules/member/lld.md
```

结构化合并：API 表行写入模块 LLD 接口契约表；ADR 与设计摘要写入 `## Promoted from change` 节。然后方可 `hx archive`（见场景 15 §6）。

## 门禁（enterprise）

| stage/task | 套件 / 传感器 |
| --- | --- |
| dev:propose | `prd-complete`、`prd-approved`、`requirements-complete` |
| dev:design | `arch-approved`、`arch-change-align`、`design-hld-complete`、`design-lld-complete`、… |
| dev:verify | `arch-drift`（warn）、`design-drift`、`uat-complete`、… |

## 常见 BLOCKER

| 现象 | 修复 |
| --- | --- |
| `PRD not approved` on dev:propose | `hx approve prd <slug> --approver <name>` |
| `global architecture not approved` on dev:design | `hx approve arch --approver <name>` |
| `archive requires hx arch promote` | 验证后执行 `hx arch promote <change>` |

## 延伸阅读

- [场景 15：enterprise 交接](15-企业级需求到交付交接.md)
- [操作说明 §4.3 req/arch stages](../operation-guide.zh-CN.md)
- [用户指南 §1.7 req/arch 阶段](../usage-guide.zh-CN.md)
