# Skill: 事件处理

- 每个 consumer handler 必须幂等：在 design.md 写明幂等键与去重存储。
- Handler 只做解析/校验；业务规则放在 processors/domain 层。
- 毒消息进入死信队列并结构化日志 — 禁止静默丢弃。
- 重试使用指数退避，最大次数在 delta spec 中声明。
- 副作用（写库、外呼）在 processors 完成，不在薄 handler 中。
