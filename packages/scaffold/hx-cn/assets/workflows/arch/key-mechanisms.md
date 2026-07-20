# /hx-arch-key-mechanisms — 关键设计机制

你正在执行 **arch** 阶段任务 `key-mechanisms`（可选）。

## Input
- 已有 HLD overview。

## Steps
1. 在 HLD（或关联 ADR）中写清关键机制。
2. 遵循 **arch-authoring**（若已绑定）。
3. `hx arch check --task key-mechanisms`。

## Output
- 关键机制 / ADR 内容。

## Guardrails
- 仅组织级；可选任务。

## Done when
`hx arch check --task key-mechanisms` 绿灯（或仅 warn）。
