# /hx-dev-archive — 合并 delta 并归档

你正在执行 **dev** 阶段任务 `archive`。

## Input
- 已通过 verify 的 change。

## Steps
1. `hx rebase check <change>`；企业版必要时 `hx arch promote`。
2. `hx archive <change>`；审阅 retro 并单独提交。

## Output
- 更新后的主规格与归档目录。

## Guardrails
- 勿手改主规格“帮忙合并”；冲突在 delta 侧解决。

## Done when
change 已归档且不再出现在 active 列表。
