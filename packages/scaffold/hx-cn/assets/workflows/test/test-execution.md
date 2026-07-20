# /hx-test-test-execution — 测试执行 / UAT / 报告

你正在执行 **test** 阶段任务 `test-execution`。

## Input
- 已有用例的 change。

## Steps
1. 执行用例；记录 UAT/缺陷；必要时 `hx test report init <change>`。
2. `hx gate check <change> --stage test --task test-execution`。

## Output
- UAT 证据、缺陷关闭、测试报告。

## Guardrails
- 未经人工/策略登记不得随意 waiver 失败项。

## Done when
test-execution 门禁绿灯。
