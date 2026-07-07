# Skill: 前端页面布局

## 壳组件（页面仅由以下壳组合）

- B2B 管理端：`src/layouts/AdminShell.tsx`、`AuthLayout.tsx`
- B2C 门户：`src/layouts/PortalShell.tsx`、`MarketingLayout.tsx`

## 规则

- 页面文件只组合壳 + 区块/组件；`src/pages` 中禁止 fetch 或业务规则。
- 跨页逻辑放在 `src/hooks`；基础组件放在 `src/components`。
- 新页面须在 apply 前写入 `design/ui/pages.md`（含路由与壳）。
- 间距使用设计令牌（`spacing.*`）——见 **design-tokens** Skill。
