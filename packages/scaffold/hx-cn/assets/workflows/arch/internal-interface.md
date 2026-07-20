# /hx-arch-internal-interface — 模块 LLD

你正在执行 **arch** 阶段任务 `internal-interface`。

## Input
- `registry.yaml` 中的 module id。

## Steps
1. 缺失时：`hx arch lld init <module> --title "..."`。
2. 填写模块 LLD。
3. `hx arch check --task internal-interface --module <module>`。
4. 需要时人工批准。

## Output
- `docs/architecture/modules/<module>/` 下的 LLD。

## Guardrails
- 仅组织级模块设计；不写 change `design/`。

## Done when
内部接口检查绿灯，并在需要时完成批准。
