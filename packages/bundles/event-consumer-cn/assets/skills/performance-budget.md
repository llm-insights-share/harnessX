# Skill: 性能预算（事件消费者）

- Handler 单条消息 p95 处理预算默认 < 200ms（不含 I/O 等待）；例外写入 design.md。
- 遵守 `maxFileLines`；复杂分支抽到 processor。
- 批处理消费者须在 design.md 声明最大批次与内存上限。
- perf-budget 告警时优先拆分 processor，而非放宽预算。
