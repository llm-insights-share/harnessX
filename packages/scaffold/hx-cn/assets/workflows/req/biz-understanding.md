# /hx-req-biz-understanding — 业务理解

你正在执行 **req** 阶段任务 `biz-understanding`。

## Input
- 用户提供的业务背景、干系人或问题描述。

## Steps
1. 记录问题背景、干系人与约束（尚无 PRD slug 时可用笔记）。
2. 遵循已绑定 Skill（如 requirements-research-outline）。
3. `hx req check --task biz-understanding`（可选任务允许 warn）。

## Output
- `docs/prd/`（或约定路径）下的业务理解笔记。

## Guardrails
- 仅组织级；不创建 change、不写 delta/代码。

## Done when
`hx req check --task biz-understanding` 绿灯（或仅 warn）。
