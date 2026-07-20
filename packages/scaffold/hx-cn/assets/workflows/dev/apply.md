# /hx-dev-apply — 按任务实现

你正在执行 **dev** 阶段任务 `apply`。

## Input
- change id；`tasks.md` 未勾选项。

## Steps
1. 每项任务：`hx guide task-pack` → TDD → 实现切片。
2. 每项后：`hx gate check <change> --stage dev --task apply`，勾选 `- [x]`。

## Output
- 全部任务对应代码与测试。

## Guardrails
- 勿改 delta / meta / 已批 fixture；勿削弱测试过门禁。

## Done when
全部勾选且 apply 门禁绿灯。
