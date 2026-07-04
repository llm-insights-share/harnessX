# 场景 06：存量项目迁移 —— OpenSpec 导入与遗留代码补规格

## 背景

会员系统（member-service）是三年老项目：一半团队去年开始用 OpenSpec 管理规格（`openspec/` 目录下已有 7 个 capability 的 spec 和 2 条进行中的 change），另一半代码从未有过规格。团队决定整体迁到 HarnessX，要求：

1. **保留** OpenSpec 已有的规格资产和进行中的工作，不中断；
2. 对无规格的遗留代码，**渐进式**补规格，而不是停下来搞"规格大会战"。

## 操作步骤

### 1. 导入 OpenSpec 资产

```console
$ cd member-service
$ hx openspec import --from openspec
Imported specs: member-account, member-points, member-level, member-benefits, member-signin, member-referral, member-tags
Imported changes: points-expiry, level-downgrade
  note: seeded meta.yaml for imported change "points-expiry"
  note: seeded meta.yaml for imported change "level-downgrade"
  note: imported project.md as constitution.md
```

导入做了三类映射：

- `openspec/specs/<cap>/spec.md` → `harnessX/specs/<cap>/spec.md`（格式兼容，Requirement/Scenario 结构原样可用）；
- 进行中的 change 连目录搬入 `harnessX/changes/`，并根据其 delta 涉及的 capability 推断 touched domains，补种 meta.yaml（初始状态 proposed，两位负责人自行用 `hx gate advance` 对齐到实际进度）;
- `openspec/project.md` 成为 `constitution.md` 的初稿，团队再精简成 5–10 条原则。

> 备选方案：如果暂时不想搬目录，`config.yaml` 里设 `compat_mode: openspec`，HarnessX 会直接把 `openspec/` 当工作目录用，两套工具短期并行。

随后照场景 01 补齐 `hx hooks install`、`hx ci init`、`hx adapter sync`。

### 2. 摸清家底：sync 漂移检测

```console
$ hx sync
[scenario-without-test] Scenario: points frozen during dispute (member-points/积分冻结)
  → Spec declares "points frozen during dispute" but no test references it. Either the behaviour regressed (fix code/tests) or the spec is stale (open a change with a REMOVED/MODIFIED delta).
[scenario-without-test] Scenario: referral reward capped monthly (member-referral/推荐奖励)
  → ...
[test-without-scenario] Scenario: vip auto renewal
  → Tests reference "Scenario: vip auto renewal" but no archived spec declares it. Backfill the spec via a change (ADDED delta) or rename the test.
```

三类漂移，三种处理：

| 漂移 | 含义 | 处理 |
| --- | --- | --- |
| 规格有、测试无 | 行为可能已退化，或规格过时 | 排查：还需要 → 补测试；不需要 → 开 change 走 `REMOVED` delta |
| 测试有、规格无 | 代码先行的"黑户行为" | 开 change 走 `ADDED` delta 回写规格（见下一步） |
| 都没有（纯遗留代码） | sync 看不见 | 靠"改哪补哪"策略渐进覆盖（步骤 4） |

### 3. 回写"黑户行为"：以 VIP 自动续费为例

`vip auto renewal` 有测试有代码，就是没规格。刘工开一条专门的回写 change——**注意：回写规格不改代码**：

```console
$ hx change create backfill-vip-renewal --domains member-benefits
```

"考古"（从代码和测试里挖出既有行为、含边界条件）正是 agent 擅长的活。刘工在 Cursor 里下达任务，明确这是"回写现状"而非"设计新行为"：

```text
Cursor ▸ /hx-propose backfill-vip-renewal
         这是一条规格回写 change：把 @src/benefits/autoRenewal.ts 和
         @tests/benefits/autoRenewal.test.ts 中的既有行为原样写成 EARS 规格。
         不许改任何代码；发现行为可疑也只记录在 proposal 的 open questions 里。
```

agent 读完代码产出的 delta（刘工重点核对"写的是现状而不是 agent 以为的应然"）：

```markdown
## ADDED Requirements

### Requirement: VIP 自动续费
WHEN VIP 到期前 24 小时且用户开启自动续费且扣款成功, THE SYSTEM SHALL 延长会籍 31 天并发送续费成功通知。

#### Scenario: vip auto renewal
- GIVEN 到期前 24h、自动续费开启、余额充足
- WHEN 续费任务执行
- THEN 会籍 +31 天，通知发出

#### Scenario: renewal skipped when payment fails
- GIVEN 扣款失败
- WHEN 续费任务执行
- THEN 会籍不变，24h 后重试，连续 3 次失败后关闭自动续费
```

第二个 Scenario 是考古时在代码里发现的重试逻辑——**回写的价值就在这**：把只存在于代码里的隐性决策显性化。既有测试文件补上 `Scenario:` 标注后，`hx verify` 直接通过，archive 后这块行为从此有据可查。

### 4. 渐进策略：改哪补哪

团队约定写进 constitution：

```markdown
6. 触碰无规格遗留模块的 change，必须在同一 change 内为所触碰的行为补 ADDED delta（"改哪补哪"）。
```

配合每晚 CI cron 跑 `hx janitor run`，漂移清单出现在巡检报告里，三个月后 sync 输出从 41 条降到 6 条。

### 5. 进行中 change 的收尾

导入的 `points-expiry` 在旧流程里已写完代码。负责人补齐缺口即可归档：

```console
$ hx trace check points-expiry
points-expiry: 3 covered, 0 waived, 1 uncovered
  UNCOVERED member-points/积分过期 — Scenario: expiry notification sent 7 days ahead
# 补一个通知测试后：
$ hx verify points-expiry
VERIFIED
$ hx archive points-expiry
Merged capabilities: member-points
```

## 关键机制解析

- **迁移的最小侵入原则**：导入不重写任何规格内容，只搬位置、补管理元数据（meta.yaml）。团队第一天就能用新流程干活，而不是先停两周做迁移。
- **sync 是"债务仪表盘"**：它不阻断任何事（跟 gate 不同），只是让规格债务持续可见。阻断留给增量：新 change 的 verify gate 该拦照拦。
- **回写规格 ≠ 补文档**：回写产物是可验证的（EARS + Scenario→测试映射），从此该行为的任何回归都会被 verify 拦住——这是它和"补一篇 wiki"的本质区别。
