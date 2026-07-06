# Design: bulk-issue-coupon

## Context

批量发券需支持运营后台一次导入 10 万条券码，且与现有单券发放 API 共存。proposal 要求 p95 < 500ms（导入任务异步）。

## API Surface

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | /v1/coupons/bulk-jobs | 创建批量发券任务 | admin JWT |
| GET | /v1/coupons/bulk-jobs/{id} | 查询任务进度 | admin JWT |

## Data Model

- 新增 `bulk_coupon_jobs`（id, status, total, processed, created_at）
- `coupons` 表增加 `job_id` 可空外键；索引 `(job_id, status)`

## Decisions (ADR)

### ADR-1: 异步任务 + 消息队列
- Status: accepted
- Decision: 导入解析走 SQS，worker 批量 INSERT
- Alternatives considered: 同步单事务（拒绝：超时与锁表）
- Consequences: 需任务状态轮询 API；运维需监控队列积压

## Architecture Constraints

- routes 仅调用 services；services 通过 repository 访问 DB
- 单 worker 批次 ≤ 500 条，避免长事务

## Observability

- Metrics: `bulk_job_duration_seconds`, `bulk_job_failures_total`
- Log fields: `job_id`, `batch_size`, `error_code`
- Alerts: 队列深度 > 10000 持续 5 分钟

## Rollback Plan

- 功能开关 `bulk_coupon_enabled=false` 关闭新 API
- 已写入券码标记 `source=bulk` 可批量作废脚本
