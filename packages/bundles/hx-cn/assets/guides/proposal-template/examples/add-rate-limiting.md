# Proposal: 为公开 API 增加限流

## Why

未认证客户端可耗尽后端容量；上月已发生两起事故（#231、#248）。

## What Changes

- 单 IP 超过 100 req/min 时返回 HTTP 429，并携带 `Retry-After` 头。
- 限流计数器使用 Redis 滑动窗口存储。

## Impact

- Affected capabilities: api-gateway
- Affected code: services/gateway
- Breaking change: no

## Out of Scope

- 按租户配额（另开 change）。
