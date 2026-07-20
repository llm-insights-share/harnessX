# /hx-dev-design — change 设计与 delta 定稿

你正在执行 **dev** 阶段任务 `design`。前置：propose 门禁绿灯。

## Input
- change id；Context Pack 中的组织架构。

## Steps
1. `hx design <change>`，填写 HLD/LLD。
2. 定稿 delta（EARS、可度量响应、稳定 `Scenario:`）；必要时 `hx rebase check`。
3. `hx gate check <change> --stage dev --task design`。
4. 需要时人工：`hx gate approve <change> --gate spec --approver <name>`（代理不可自批）。

## Output
- change `design/` 与定稿 delta。

## Guardrails
- 不写生产代码；批准后勿擅自改 delta。

## Done when
design 门禁绿灯，且所需人工批准已记录。
