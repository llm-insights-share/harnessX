# 宪法示例 02：支付网关

| | |
| --- | --- |
| **项目** | `payment-gateway` |
| **技术栈** | Java/Go 微服务，支付核心 |
| **Profile** | 核心域默认 `strict`，测试先行 |
| **关联场景** | [03 核心域 strict](../03-核心域改动-strict-测试先行.md) |

## 设计要点

- 资金、账务、审计为宪法级约束；`hx testfirst` 流程由第 2、4 条支撑。
- 对账域禁止 lite 属于「无例外」红线，比口头约定更可执行。
- 跨域引用限制与 `arch-boundary` sensor 配合。

## `harnessX/constitution.md`（可复制）

```markdown
# 项目宪法 — payment-gateway

> 最高优先级 Guide。支付核心逻辑的错误成本为资金损失与监管处罚，本文档优先级高于一切 Skill。

## 核心域

core-domains: [payment-charging, payment-settlement, payment-reconciliation]

## 原则

### 规格与门禁

1. 规格是唯一事实源；行为变更仅通过 change + delta spec，归档后才成为主规格真相。
2. 触及 `core-domains` 的 change **默认 strict**：须 explore、verification-strict 套件，且 **测试先行**（`hx testfirst` 批准后才允许实现任务）。
3. Gate fail-closed；任何 sensor 异常视为失败，禁止以「环境问题」绕过 merge。
4. spec→plan 与 testfirst 断言批准须不同角色（开发 ≠ QA 批准人），记录于 `meta.yaml`。

### 资金与账务

5. **所有资金变动可审计、可回放**。每笔 charge/settlement 须有可追溯 `ledger_entry_id`；禁止仅更新余额表而不写流水。
6. **禁止静默舍入**。费率、分账比例使用约定精度（金额分、费率万分比）；舍入规则在 spec 中声明，代码与 spec 不一致视为缺陷。
7. **预授权与扣款分离**。冻结、确认扣款、释放须为独立可测试状态；不得合并为单步「扣款」掩盖中间态。

### 安全与合规

8. **卡号/密钥零落盘**。PAN、CVV、渠道密钥不得出现在日志、spec 示例、测试 fixture 或 Agent 上下文；仅用 token / 假数据。
9. **跨域调用显式声明**。支付域不得直接写商户域表；跨域仅通过已登记的 integration 接口或事件，违反 `arch-boundary` 一律阻断。

### 变更与发布

10. **生产热修须双轨留痕**。线上 lite 修复必须在 24h 内补归档 spec + 回归用例；对账域改动禁止 lite，无例外。
```

## 校验

```bash
hx harness lint
hx change create pre-auth --domains payment-charging
hx profile recommend pre-auth
# 预期推荐 strict
```
