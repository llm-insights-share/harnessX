# Skill: 编写 EARS Delta Spec

如何撰写能通过 `spec-validate` 校验、且可机器验证的需求文本与场景。

## 需求文本（EARS）

- 句式：`WHEN <触发条件>, THE SYSTEM SHALL <响应>`（事件驱动）或 `THE SYSTEM SHALL <响应>`（普适）。状态驱动用 `WHILE <状态>`；非期望行为用 `IF <条件>, THEN THE SYSTEM SHALL`。
- 响应必须可观察、可度量：写明状态码、字段、上限、超时。禁用模糊词：quickly、appropriately、properly、robust、user-friendly、as needed 及中文等价表述（如「尽快」「适当」「友好」）。
- 一条需求一个行为。若两个 SHALL 之间写了 "and"，应拆成两条。

## 场景（Scenario）

- 每条 ADDED/MODIFIED 需求至少有一个 `#### Scenario: <稳定名称>` 块，内含 GIVEN/WHEN/THEN 要点。
- 场景名是契约标识：测试标题须字面引用（`Scenario: <name>`），traceability 按精确字符串匹配。勿随意改名——否则会与测试脱节。
- 覆盖主路径及改变行为的错误/边界情况（空输入、超限、未授权、并发更新），不必穷举所有理论组合。

## Delta 纪律

- `## ADDED Requirements` 表示新行为；`## MODIFIED Requirements` 须**全文**重写更新后的需求（合并为替换式——部分文本会静默丢失其余内容）；`## REMOVED Requirements` 仅列需求标题名，附一行原因。
- 写 MODIFIED/REMOVED 前须阅读当前主规格；复制精确的需求标题以便合并定位。
- 每个 capability 一个 spec 文件；跨 capability 的变更须为每个 capability 目录各写一份 delta。
