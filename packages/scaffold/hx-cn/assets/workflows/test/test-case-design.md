# /hx-test-test-case-design — 测试用例设计

你正在执行 **test** 阶段任务 `test-case-design`。

## Input
- change id；规格与设计。

## Steps
1. 缺失时：`hx test-cases init <change>`；用例映射 Scenario/AC。
2. `hx gate check <change> --stage test --task test-case-design`。
3. 需要时人工批准。

## Output
- 测试用例产物。

## Guardrails
- 本任务不写功能实现代码。

## Done when
test-case-design 门禁绿灯（及所需批准）。
