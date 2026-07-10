# 宪法示例 01：优惠券 / 会员营销 API 服务

| | |
| --- | --- |
| **项目** | `coupon-service`（RetailCo） |
| **技术栈** | Node/Go REST，`hx init --bundle api-service` |
| **Profile** | 日常 `standard`；触及核心域推荐 `strict` |
| **关联场景** | [01 新项目接入](../01-新项目接入.md)、[05 紧急修复 lite](../05-紧急修复-lite.md) |

## 设计要点

- `core-domains` 与 `hx change create --domains` 对齐，驱动 `hx profile recommend` 倾向 strict。
- 金额精度、核销幂等、券状态机为业务红线，适合写入宪法而非 Skill。
- 第 10 条为 P1 hotfix 留痕约定，与场景 05 的 `lite` override 配套。

## `harnessX/constitution.md`（可复制）

```markdown
# 项目宪法 — coupon-service

> 最高优先级 Guide（FR-034）。Guide / Sensor 冲突时以本文档为准。
> 保持简短：不可违背原则写在这里，编码细则见 `coding-conventions` 等 Skill。

## 核心域

<!-- 触及以下域的 change，hx profile recommend 倾向 strict（FR-013） -->
core-domains: [coupon-issuing, coupon-redemption, member-points]

## 原则

### 交付与规格

1. **规格是唯一事实源**。与已归档规格不一致的代码，二者必有一错——通过 `hx sync` 显式解决，禁止静默忽略或「先合码再补 spec」。
2. **一切行为变更必须经过 change 工作区**（propose → … → archive）。禁止直接修改 `harnessX/specs/` 主规格。
3. **验证门禁 fail-closed**。Sensor 崩溃、超时或输出不可解析一律阻断；本地通过不能代替 CI `hx gate check` 重放。
4. **人类批准意图，机器验证实现**。spec→plan 门禁始终需要指定批准人；P0 场景须 `hx trace check` 可追溯。

### 业务与精度（不可妥协）

5. **金额一律整数分（cent）**。优惠券面额、抵扣额、积分折算禁止浮点；展示层格式化，存储与计算层只用整数。
6. **核销幂等**。同一 `idempotency-key` 重复请求必须返回相同业务结果，禁止二次扣减或重复发券。
7. **券状态机不可绕过**。`issued → locked → redeemed / expired / void` 仅允许文档化转移；不得用「直接改库」跳过状态校验（紧急修复亦须 delta spec 描述）。

### 安全与合规

8. **PII 最小暴露**。会员手机号、证件号不得写入日志、错误体或 Agent 可读的 fixture；测试数据用合成 ID。
9. **外部回调可验证**。支付/营销渠道 webhook 必须验签；未验签请求一律 401，禁止「先处理再补验签」。

### 紧急通道（留痕）

10. **核心域 lite 降级须显式 override**。触及 `core-domains` 而走 `lite` 时，必须在 `meta.yaml` 记录 `--override-reason`、事故单号与事后补 spec 时限（默认 48h）。
```

## 校验

```bash
hx harness lint
hx change create smoke --domains coupon-redemption
hx profile recommend smoke
```
