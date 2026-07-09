# 场景 21：Hub 双角色与贡献审核

**角色**：赵平台（运维 / maintainer）、王开发（使用 / consumer）  
**目标**：业务项目查询 Hub 资产并提交优秀 Skill；运维项目在管理仓库审核后合并到正式 Hub。

---

## 1. 运维项目：初始化 Hub 连接

```bash
cd hx-hub-ops
# config.yaml
hub:
  source: git@github.com:your-org/hx-hub.git
  role: maintainer
  actor: zhao.platform
```

```bash
hx hub policy check --strict
hx hub contributions list --status pending
```

## 2. 业务项目：消费与提交

```bash
cd orders-service
# config.yaml
hub:
  source: git@github.com:your-org/hx-hub.git
  role: consumer
  actor: wang.dev
```

```bash
hx hub search prd --category package
hx hub add prd-writing@1.0.0
hx lock write

# 沉淀本地 Skill 并提交审核
hx asset promote harnessX/assets/guides/idempotency-keys --to trial
hx hub submit harnessX/assets/guides/idempotency-keys --evidence "8 weeks: flaky tests 11/mo → 0"
```

提交写入 Hub 的 `contributions/wang.dev/idempotency-keys/<version>/`，状态为 `pending`。

## 3. 运维审核与合并

在 **运维项目**（`role: maintainer`）中：

```bash
hx hub contributions list --status pending
hx hub contributions show wang.dev/idempotency-keys@1.0.0
hx hub contributions accept wang.dev/idempotency-keys@1.0.0 --reviewer zhao.platform
hx hub asset promote idempotency-keys@1.0.0 --to enforced
hx hub push --message "accept: idempotency-keys@1.0.0"
```

合并后资产进入 `packages/idempotency-keys/1.0.0/`，业务项目可安装：

```bash
hx hub add idempotency-keys@1.0.0
hx lock write
```

## 4. Hub 策略（hub-policy.yaml）

```yaml
version: "1.0"
maintainers:
  - zhao.platform
minApprovals: 1
consumerCanSubmit: true
installRequiresApproval: true
```

- `consumerCanSubmit: false` 时禁止 `hx hub submit`
- `installRequiresApproval: true` 时 consumer 角色 `hx hub add` 仅允许 `review=approved` 的包

## 5. 相关文档

- [Hub 资产维护手册](../hub-asset-maintenance.zh-CN.md)
- [场景 08：Hub 资产共享与供应链](08-hub-资产共享与供应链.md)
