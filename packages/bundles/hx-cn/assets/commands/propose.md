# /hx-propose — 起草提案与初始 delta spec

你正在执行 **propose** 阶段。交付物为完整的 `proposal.md` 与可通过 `spec-validate` 的初版 delta spec。

## 步骤

1. 若 change 工作区不存在：`hx change create <kebab-name> --domains <d1,d2>`。
2. 生成脚手架：`hx propose <change> --title "<简短祈使句标题>"`。
3. 填写 `harnessX/changes/<change>/proposal.md` 的**每一节**：
   - **Why** — 问题描述，1–3 句，关联工单/事件；
   - **What Changes** — 可观察行为变化，条目列表；每条须映射到 delta spec 的一条 Requirement；
   - **Impact** — 影响的 capability、代码区域、是否破坏性变更；
   - **Out of Scope** — 本 change 明确不做的事。
   删除所有指引注释及 `{{title}}` 占位符（如有）。
4. 重写 `harnessX/changes/<change>/specs/<capability>/spec.md` 中的 delta spec：
   - 使用 `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements`；
   - 每条需求文本须符合 EARS 句式（见 spec-writing Skill）：`WHEN <触发>, THE SYSTEM SHALL <可度量响应>`；
   - 每条 ADDED/MODIFIED 需求至少一个 `#### Scenario:` 块，含 GIVEN/WHEN/THEN 要点；
   - MODIFIED 须包含**全文**更新后的需求（合并为替换式）——先阅读 `harnessX/specs/<capability>/spec.md` 中的当前主规格。
5. 校验并迭代至通过：`hx gate check <change> --phase spec`。阅读每条 BLOCKER 的 `fix_hint`，修正**制品**而非 sensor。

## 护栏

- 本阶段不要写实现代码或测试。
- 不要臆造用户未要求的需求；锦上添花放入 Out of Scope。
- 歧义阻碍进展时，在 proposal.md 顶部列出开放问题并向人类求证，不要猜测。

## 完成标准

`hx gate check <change> --phase spec` 通过，且人类阅读 proposal.md + delta spec 后能明确知道将改变哪些行为。
