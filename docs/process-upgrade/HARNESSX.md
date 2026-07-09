# process-upgrade 与 HarnessX 的关系

本目录提供**组织级过程治理**的可复用模板与政策文档，面向产品、架构、测试与发布 Owner。

## 与 HarnessX bundle 的分工

| 资产位置 | 用途 | 如何接入 Agent |
| --- | --- | --- |
| `docs/process-upgrade/templates/` | 人工评审、PR、测试报告等**组织流程**模板 | 团队手册 / Wiki；不自动编译到 IDE |
| `packages/bundles/*/assets/guides/` | **Agent 前馈**模板与 Skill（prd-template、design-template 等） | `hx init` + `hx adapter sync` → `/hx-prd`、`/hx-design` |
| `docs/prd/`、`docs/architecture/` | **组织级活制品**（Pre-phase 真相源） | `/hx-prd`、`/hx-arch` + `hx gate approve` |
| `harnessX/changes/*/requirements/`、`design/` | **单次 change** 蒸馏与交付设计 | `/hx-propose`、`/hx-design` + Context Pack 自动注入 org 制品 |

## 推荐映射

| process-upgrade 模板 | HarnessX 等价物 |
| --- | --- |
| `requirements-template.md` | bundle `requirements-template` + `docs/prd/<slug>.md` |
| `hld-template.md` | bundle `arch-hld-template` + `docs/architecture/overview.md` |
| `lld-template.md` | bundle `arch-lld-template` + `docs/architecture/modules/*/lld.md` |
| `release-gate-policy.md` | `harness.yaml` suites + `hx gate check` |
| `test-report-template.md` | `hx verify` + traceability + CI 重放 |

## 企业完整旅程

1. 组织 Pre-phase：场景 [19](../examples/19-组织级PRD与架构设计.md)（`/hx-prd` → `/hx-arch` → `/hx-arch-lld`）
2. Change 交付：场景 [15](../examples/15-企业级需求到交付交接.md)（`change create` → propose → design → … → archive）
3. 归档前：`hx arch promote <change>` 将 change design 沉淀回组织模块 LLD

详见 [usage-guide.zh-CN.md](../usage-guide.zh-CN.md) 企业交付小节。
