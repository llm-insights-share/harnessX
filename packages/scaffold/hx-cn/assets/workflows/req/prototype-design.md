# /hx-req-prototype-design — 产品原型设计

你正在执行 **req** 阶段任务 `prototype-design`。

## Input
- PRD slug；可用的分析/PRD。

## Steps
1. 缺失时：`hx req prototype init <slug>`。
2. 填写页面清单/线框说明。
3. 遵循 **prototype-wireframe** Skill（若已绑定）。
4. `hx req check --task prototype-design --prd <slug>`。

## Output
- 组织级原型页面清单。

## Guardrails
- 仅组织级；不写生产 UI 代码。

## Done when
`hx req check --task prototype-design --prd <slug>` 绿灯。
