# 宪法示例 03：B2B 多租户企业 SaaS 平台

| | |
| --- | --- |
| **项目** | `acme-platform` |
| **技术栈** | 多租户 CRM + 工单，monorepo 或模块化单体 |
| **Profile** | `enterprise` / `enterprise-sdlc` |
| **关联场景** | [14](../14-企业全栈多角色交付.md)、[15](../15-企业级需求到交付交接.md)、[19](../19-组织级PRD与架构设计.md) |

## 设计要点

- 第 4 条明确 PRD / 全局架构 / change spec 三类批准不可互换，支撑 Pre-phase 双轨。
- 第 8 条与 `docs/architecture/registry.yaml`、`arch-boundary` 对齐。
- 适合 `hx init --from-hub enterprise-sdlc@1.0.0` 初始化后填写。

## `harnessX/constitution.md`（可复制）

```markdown
# 项目宪法 — acme-platform

> 最高优先级 Guide。多租户 SaaS：租户隔离与权限是底线，优先于交付速度。

## 核心域

core-domains: [tenant-isolation, authorization, billing-subscription]

## 原则

### 交付体系

1. 规格为唯一事实源；组织级需求在 `docs/prd/`，单次增量在 change `requirements/` + delta spec，二者不得混写。
2. 一切行为变更经 change 工作区；`enterprise` change 归档前须 `hx arch promote` 将 design 沉淀回 `docs/architecture/modules/`。
3. Gate fail-closed；CI 的 `hx gate check` 为 merge 最终裁决。
4. 人类批准 PRD（`hx approve prd`）、全局架构（`hx approve arch`）、change spec（`hx gate approve --gate spec`）——三类批准不可互相替代。

### 多租户与权限

5. **租户数据硬隔离**。任何查询、缓存 key、搜索索引必须带 `tenant_id`；禁止默认「全局查询」或跨租户 join，测试须含跨租户越权用例。
6. **权限默认拒绝**。新 API 默认需鉴权；匿名或仅登录无授权的路径须在 spec 中显式标注并经过安全评审。
7. **订阅与计费一致性**。套餐变更、席位增减须与 `billing-subscription` spec 一致；禁止直接改库绕过计费事件。

### 技术边界

8. **单体模块化，禁止随意跨模块引用**。`orders` 不得 import `billing` 内部包；跨模块经 `registry.yaml` 登记的端口/事件（`arch-boundary` 强制执行）。
9. **对外 API 版本化**。破坏性变更须新版本路径或显式 deprecation 周期，禁止 silent breaking change。

### 数据与隐私

10. **客户业务数据不出境**（除非 PRD 声明且合规批准）。日志、备份、第三方 SaaS 集成须在同一宪法约束下评估；PII 脱敏规则见 `common-review-rubrics`，但「禁止出境」以本宪法为准。
```

## 校验

```bash
hx harness lint
hx change create tenant-export --domains tenant-isolation --profile enterprise
hx arch check
```
