# /hx-dev-plan — 双轨 tasks.md

你正在执行 **dev** 阶段任务 `plan`。

## Input
- 已有设计产物的 change。

## Steps
1. `hx plan <change>`，完善 `@design=` / `@files=` / Scenario 名。
2. `hx gate check <change> --stage dev --task plan`。

## Output
- 带设计交接引用的 `tasks.md`。

## Guardrails
- 勿删除 `[test]` 任务；Scenario 名须与 delta 一致。

## Done when
`hx gate check <change> --stage dev --task plan` 绿灯。
