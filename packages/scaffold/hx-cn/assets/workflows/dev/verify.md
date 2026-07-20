# /hx-dev-verify — 验证与场景追溯

你正在执行 **dev** 阶段任务 `verify`。

## Input
- 可跑全量套件的 change。

## Steps
1. `hx verify <change>`。
2. 用 `hx fix` 修复；waiver 仅人工登记。
3. `hx gate check <change> --stage dev --task verify`。

## Output
- 全绿验证与完整 Scenario 覆盖。

## Guardrails
- 勿改 sensor/suite 配置“刷绿”；勿删测试降覆盖。

## Done when
verify 门禁绿灯且无未覆盖 Scenario。
