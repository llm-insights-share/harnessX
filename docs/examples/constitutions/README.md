# 项目宪法示例（constitution.md）

HarnessX 的 **项目宪法**（`harnessX/constitution.md`）是最高优先级 Guide（FR-034），不随 change 变化。冲突时按 **constitution > profile > bundle > asset** 裁决。

| 文档 | 适用场景 | 关联场景 |
| --- | --- | --- |
| [01 优惠券 / 会员营销 API](01-coupon-service.md) | RetailCo 营销后端，`api-service` bundle | [01](../01-新项目接入.md)、[02](../02-标准功能开发全流程.md)、[05](../05-紧急修复-lite.md) |
| [02 支付网关](02-payment-gateway.md) | 预授权 / 清分 / 对账，强监管核心域 | [03](../03-核心域改动-strict-测试先行.md) |
| [03 B2B 多租户 SaaS](03-b2b-saas-platform.md) | 企业交付，多角色 + Pre-phase | [14](../14-企业全栈多角色交付.md)、[15](../15-企业级需求到交付交接.md)、[19](../19-组织级PRD与架构设计.md) |
| [04 遗留系统渐进迁移](04-legacy-migration.md) | OpenSpec 存量仓，改哪补哪 | [06](../06-遗留项目迁移-openspec.md) |

**用法**：复制示例中的 `constitution.md` 正文到 `harnessX/constitution.md`，按项目裁剪后执行：

```bash
hx harness lint
hx adapter sync
```

概念说明见 [使用说明 §2.2](../../usage-guide.zh-CN.md#22-项目宪法-constitutionmd)。

**English**: see [usage guide §2.2](../../usage-guide.en.md#22-constitution-constitutionmd).
