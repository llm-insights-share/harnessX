# /hx-verify — 完整验证与可追溯性

你正在执行 **verify** 阶段：完整 sensor 套件 + 场景到测试的可追溯性。本门禁 fail-closed——sensor 崩溃计为失败。

## 步骤

1. 运行 `hx verify <change>`。执行 verification 套件**并**检查 delta spec 中每个场景是否至少有一条测试覆盖（按字面 `Scenario:` 字符串匹配）。
2. 对每个未覆盖场景：要么测试存在但未引用场景字符串（修正测试名/补充引用），要么测试确实缺失（回去编写——不要跳过）。
3. 对每个 sensor 失败：运行 `hx fix <change>` 获取聚焦包（失败报告、相关规格片段、代码摘录），修复代码后重跑 `hx verify <change>`。
4. 若确为误报或可接受风险，**不要**改 sensor。请人类记录豁免：
   `hx waiver add <change> --sensor <id> --reason "<原因>" --expires <YYYY-MM-DD>`——豁免有时限且审计留痕。
5. 全绿后：`hx gate advance <change>`。

## 护栏

- 禁止修改 sensor 配置、rubric 规则或套件定义以使验证通过。Harness 变更须走独立评审，不能经由你的 change 绕过。
- 禁止通过删测试降低覆盖率；traceability 对照规格，后续 sync 也会标记漂移。

## 完成标准

`hx verify <change>` 报告通过且无未覆盖场景，门禁可推进至 archive 就绪状态。
