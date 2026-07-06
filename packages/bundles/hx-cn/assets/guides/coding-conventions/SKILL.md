# Skill: 编码规范

在本仓库编写或修改代码时遵循以下约定。

- 优先小模块、单一职责；单文件避免超过约 400 行。
- 仅在系统边界校验输入；内部不变量可信任。
- 禁止在未获 waiver 的情况下修改已批准的测试断言或 fixture（`hx waiver add`）。
- 测试名称引用正在实现的 requirement/scenario，例如 `it("Scenario: rejects expired token", ...)`。
- Sensor 失败时，先阅读其 `fix_hint` 与 `agent_instruction`，再改代码。
