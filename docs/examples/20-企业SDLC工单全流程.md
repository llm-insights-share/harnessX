# 场景 20：企业 SDLC 工单全流程（enterprise-sdlc profile）

| | |
| --- | --- |
| **旅程** | 企业交付 · 工单驱动 |
| **适用角色** | 总架构师、技术经理、产品、架构、开发、测试 |
| **前置** | [场景 16](16-v0.3-hub-blueprint-init.md) Hub 初始化 |
| **Profile** | `enterprise-sdlc` |

## 背景

在 [场景 19](19-组织级PRD与架构设计.md) 的 Pre-phase 之上，本场景用 **工单（Work Order）** 串联技术经理审核、变更单、测试用例审核与 Bug/复测闭环。

## 0. 初始化

```console
$ hx init --from-hub enterprise-sdlc@1.0.0 --hub ./harness-hub --adapter cursor
$ hx adapter sync
```

编辑 `harnessX/roles.yaml` 映射成员角色。

## 1. 需求审核（产品 → 技术经理）

```console
$ hx prd init member-badge --title "会员徽章"
$ hx prd submit member-badge --by pm.chen
$ hx wo inbox --role tech-manager
$ hx wo extract WO-00001 --out /tmp/review.md
$ hx wo approve WO-00001 --by tm.zhang --note "范围清晰"
$ hx approve prd member-badge --approver tm.zhang
```

## 2. 创建 change 并需求分析

```console
$ hx change create member-badge --domains member --profile enterprise-sdlc --prd member-badge
$ hx propose member-badge --title "会员徽章展示"
# 填写 requirements/ 扩展制品（调研、业务流程、集成）
$ hx gate check member-badge --phase propose
```

## 3. 需求变更（可选）

```console
$ hx cr create --kind requirement-change --action modify --prd member-badge \
    --original "旧段落" --change-note "澄清范围" --revised "新段落" --by pm.chen
$ hx cr submit CR-00001 --by pm.chen
$ hx wo approve WO-00002 --by tm.zhang
```

## 4. 概要设计审核（架构 → 技术经理 → 详细设计工单）

```console
$ hx arch init --title "会员系统"
$ hx arch submit --by lin.arch --change member-badge
$ hx wo approve WO-00003 --by tm.zhang
# 自动 spawn lld-design 工单 per module
$ hx wo list --type lld-design --change member-badge
$ hx wo done WO-00004 --by dev.zhao
$ hx approve arch-lld member --approver lin.arch
```

## 5. 测试用例设计 → 审核 → 编码 → 测试

```console
$ hx test-cases init member-badge
$ hx test-cases submit member-badge --by qa.zhou
$ hx wo approve WO-00005 --by tm.zhang
$ hx plan member-badge
$ hx apply member-badge --runner '<agent>'
$ hx bug create member-badge --title "徽章未显示" --by qa.zhou --scenario "badge visible"
$ hx bug fix member-badge BUG-001 --commit abc123 --by dev.zhao
$ hx bug close member-badge BUG-001 --by qa.zhou
$ hx verify member-badge
$ hx archive member-badge
```

## 关键命令

| 能力 | 命令 |
| --- | --- |
| 工单 | `hx wo create/submit/approve/reject/done/inbox/extract` |
| 变更单 | `hx cr create/submit/show/list` |
| 测试用例 | `hx test-cases init/check/submit` |
| Bug | `hx bug create/list/fix/close` |
| 模块 LLD 批准 | `hx approve arch-lld <module>` |

## 延伸阅读

- [场景 15](15-企业级需求到交付交接.md)
- [场景 19](19-组织级PRD与架构设计.md)
- [操作说明 §4](../operation-guide.zh-CN.md)
