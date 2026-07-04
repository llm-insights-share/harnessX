# Proposal: Add rate limiting to public API

## Why

Unauthenticated clients can exhaust backend capacity; two incidents last month (#231, #248).

## What Changes

- Requests above 100 req/min per IP receive HTTP 429 with a `Retry-After` header.
- Rate limit counters are stored in Redis with a sliding window.

## Impact

- Affected capabilities: api-gateway
- Affected code: services/gateway
- Breaking change: no

## Out of Scope

- Per-tenant quotas (separate change).
