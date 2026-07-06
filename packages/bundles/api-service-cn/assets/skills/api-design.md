# Skill: API 设计

- 每个端点须有显式请求/响应 schema；禁止无类型的 `any` 载荷。
- 错误使用 RFC 7807 problem+json：`{ type, title, status, detail }`。
- 破坏性 API 变更须在受影响 capability 的 delta spec 中写 `MODIFIED Requirements`。
- 每个列表端点须分页，提供 limit 与 cursor；默认 limit 50，最大 200。
