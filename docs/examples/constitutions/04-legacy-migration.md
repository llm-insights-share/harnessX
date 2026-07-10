# 宪法示例 04：遗留系统渐进迁移

| | |
| --- | --- |
| **项目** | `legacy-inventory-service` |
| **背景** | 5 年存量仓，`hx openspec import` 后逐步 harness 化 |
| **Profile** | 非核心模块渐进；核心库存域 strict |
| **关联场景** | [06 遗留项目迁移](../06-遗留项目迁移-openspec.md) |

## 设计要点

- 第 6 条「改哪补哪」直接对应场景 06 团队约定。
- 第 7 条与 `hx sync` / `hx janitor run` 债务仪表盘配合，避免单次 change 声称还清全部历史债。
- 第 8 条对核心域更严：禁止 lite override（与优惠券示例的「可留痕降级」形成对比）。

## `harnessX/constitution.md`（可复制）

```markdown
# 项目宪法 — legacy-inventory-service

> 最高优先级 Guide。存量代码多、主规格不全；本宪法约束「增量 harness 化」节奏，而非一夜之间全覆盖。

## 核心域

core-domains: [inventory-reservation, inventory-deduction]

## 原则

### 基础 Harness 约定（继承自 base bundle）

1. 规格是唯一事实源；已归档 spec 与代码冲突须 `hx sync` 显式裁决。
2. 新行为变更必须走 change 工作区；禁止在 main 上直接改 `harnessX/specs/`。
3. Gate fail-closed。
4. P0 行为须测试映射或带过期日的 waiver（`hx trace check`）。
5. spec→plan 须人工批准。

### 遗留迁移专用

6. **改哪补哪**。触碰无 spec 的遗留模块时，同一 change 内必须为所改行为补 ADDED delta（含至少一个 GWT Scenario）；禁止「只改代码不补 spec」。
7. **不回写历史**。`hx sync` 发现的存量漂移列入 janitor 报告，按优先级分批偿还；单次 change 不得声称「一次性对齐全部漂移」除非有专项 change 批准。
8. **核心域无豁免**。`inventory-reservation` / `inventory-deduction` 不适用「遗留免检」；触及即 strict，禁止 lite override。
9. **导入规格只增不删**。`openspec import` 后的主规格条目，归档时只允许合并增量，禁止无评审删除 IMPORTED 场景（须走 REMOVED delta + 批准）。

### 技术债边界

10. **不引入新框架**。迁移期禁止引入与现有栈正交的 ORM/消息中间件，除非有独立架构 change 且 `hx approve arch` 已更新全局 HLD。
```

## 校验

```bash
hx openspec import --from openspec
hx harness lint
hx sync
hx janitor run
```
