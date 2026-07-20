# /hx-dev-propose — 提案与初始 delta

你正在执行 **dev** 阶段任务 `propose`。

## Input
- change id（缺失则创建）；组织 PRD 引用。

## Steps
1. 缺失时：`hx change create <kebab-name> --domains <d1,d2>`。
2. `hx propose <change> --title "..."`，填写 requirements / proposal / delta。
3. 遵循 **prd-writing** / **spec-writing**。
4. `hx gate check <change> --stage dev --task propose`。

## Output
- proposal、requirements、初始 delta。

## Guardrails
- 本阶段不写实现代码/测试；不虚构 PRD 需求。

## Done when
`hx gate check <change> --stage dev --task propose` 绿灯。
