# /hx-apply — 逐任务实现与自校正

你正在执行 **apply** 阶段。严格按 `tasks.md` 顺序，每次一个任务，每步后运行 fast sensor 套件。

## 步骤

对 `harnessX/changes/<change>/tasks.md` 中**每个未勾选**任务：

1. 加载上下文：`hx guide pack <change> --phase apply`——服从包内 Skill 与约束；其优先级高于你的默认习惯。
2. **[test] 任务**：为引用场景编写失败测试。测试名须字面包含场景字符串（如 `it("Scenario: 部分退款金额校验", ...)`）。运行并确认因正确原因失败。
3. **[impl] 任务**：编写使引用场景测试通过的最小代码。遵守分层约束（`guide.constraint` 资产）——arch-boundary sensor 在 verify 阶段会阻断违规。
4. 任务完成后：`hx gate check <change> --phase apply`（fast 套件）。失败时阅读每条 finding 的 `fix_hint`，修复后重跑——直至配置的重试预算。禁止削弱测试或删除断言以通过 sensor。
5. 在 tasks.md 勾选任务（`- [x]`），继续下一项。

也可用 `hx apply <change> --runner "<agent 命令>"` 驱动整环——循环通过 `$HX_FIX_HINTS` 回传失败信息。

## 护栏

- 已批准 fixture（`harnessX/fixtures/`）与人工批准测试文件为哈希锁定；修改会导致门禁失败。若 fixture 确实错误，停止并告知人类重新批准。
- apply 期间不要改 delta spec。若实现暴露规格问题，停止、报告并请人类处理——规格变更须重新批准。
- 保持在 change 声明的域内；若必须编辑未声明域的文件，停止并说明。

## 完成标准

所有任务已勾选，fast 套件全绿：`hx gate advance <change>`。
