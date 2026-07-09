# /hx-propose — 起草提案与初始 delta spec

你正在执行 **propose** 阶段。交付物：`requirements/*`、`proposal.md`、初版 delta spec、`traces/delivery-trace.yaml` 骨架。

## 步骤

1. 若 change 工作区不存在：`hx change create <kebab-name> --domains <d1,d2>`。
2. 阅读组织 PRD（`docs/prd/<feature>.md` 或用户 `@` 引用），遵循 **prd-writing** Skill。
3. 生成脚手架：`hx propose <change> --title "<标题>"`（同时创建 requirements/、delivery-trace）。
4. 填写 `requirements/prd-summary.md`、`user-stories.md`、`nfr.md`。
5. 填写 `proposal.md` 每一节（含 **PRD Reference**）；What Changes 每条映射 PRD AC。
6. 按 spec-writing Skill 重写 delta spec。
7. 校验：`hx gate check <change> --phase propose`（enterprise：`prd-complete`、`prd-approved`、`requirements-complete`）。

## 护栏

- 本阶段不写实现代码或测试。
- 不臆造 PRD 未列出的需求。

## 完成标准

requirements 齐全、proposal + delta spec 门禁通过，人类可明确将改变哪些行为。
