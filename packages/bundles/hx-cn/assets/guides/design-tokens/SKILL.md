# Skill: 设计令牌（Design Tokens）

## 单一事实来源

- 共享令牌：`packages/design-tokens/` 或 `src/shared/tokens/`
- CSS 变量：`var(--color-*)`、`var(--spacing-*)`

## 规则

- 组件中禁止硬编码十六进制颜色或魔法像素间距。
- 本 change 新增令牌须列在 `design/overview.md` 的 **## Design Tokens** 表中。
- 有 Figma 时，在 `docs/design/token-mapping.md` 将变量名映射到令牌名。
