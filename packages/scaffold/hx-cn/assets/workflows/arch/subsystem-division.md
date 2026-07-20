# /hx-arch-subsystem-division — 全局 HLD + 注册表

你正在执行 **arch** 阶段任务 `subsystem-division`。

## Input
- 系统标题；已批准 PRD 作为上下文。

## Steps
1. 缺失时：`hx arch init --title "<system>"`。
2. 填写全局 HLD，并维护 `registry.yaml`。
3. 遵循 **arch-authoring**。
4. `hx arch check --task subsystem-division`。
5. 人工：`hx gate approve --gate arch --approver <name>`。

## Output
- `docs/architecture/overview.md` + `registry.yaml`。

## Guardrails
- 仅组织级；不做 change 设计或业务代码。

## Done when
子系统划分检查绿灯，并在需要时完成 HLD 人工批准。
