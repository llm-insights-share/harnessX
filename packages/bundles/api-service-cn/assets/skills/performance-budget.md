# Skill: 性能预算

- 端点须在声明的预算内响应（默认 p95 < 300ms）；引入更慢操作前须在 design.md 增加预算条目。
- 任何使 bundle 增加 >50KB 的新依赖须在 design.md（ADR）中说明。
