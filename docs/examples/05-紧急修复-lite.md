# 场景 05：线上 bug 紧急修复走 lite 快速通道

## 背景

周五 18:40，告警：优惠券核销接口对"已过期但未落库过期状态"的券返回 500（应返回 422）。值班的李工需要 30 分钟内出修复。走 standard 全流程（design/spec/批准/plan）显然不现实，但**完全绕过 harness 会让这次修复游离在规格体系之外**——三个月后没人知道这个行为是有意的还是巧合。

lite profile 就是为此设计的：`phases: [propose, apply, archive]`，apply 阶段跑 fast-lite 套件。

## 操作步骤

### 1. 建 change，显式降级并留痕

```console
$ hx change create hotfix-expired-coupon-500 --domains coupon-redemption --profile lite
Created change "hotfix-expired-coupon-500" (profile: lite, domains: coupon-redemption)
```

`coupon-redemption` 是宪法里的核心域，推荐值是 strict。所以补一条降级记录（值班经理口头批准，理由落库）：

```console
$ hx profile recommend hotfix-expired-coupon-500 --choose lite \
    --override-reason "P1 线上事故 INC-4521，值班经理王总批准走 lite，事后 48h 内补 spec（见步骤 5）"
recommended: strict (score 3)
  - touches core domain(s) coupon-redemption (+3)
profile set to lite (override: P1 线上事故 INC-4521，值班经理王总批准走 lite，事后 48h 内补 spec（见步骤 5）)
```

### 2. 最小提案 + 最小 delta

lite 不豁免"说清楚你在改什么"。李工把事故信息直接丢进 Cursor：

```text
Cursor ▸ /hx-propose hotfix-expired-coupon-500
         P1 事故 INC-4521：核销接口对"已过期但未落库过期状态"的券返回 500，
         应返回 422 + COUPON_EXPIRED。只修这一个行为，其余一律 Out of Scope。
```

agent 按命令提示词起草：proposal.md 三句话写完；delta spec 只有一个 ADDED Requirement（写完自跑 `hx gate check` 确认格式过关）：

```markdown
## ADDED Requirements

### Requirement: 过期券核销的显式拒绝
WHEN 核销请求命中过期时间早于当前时间的券（无论过期状态是否已落库）, THE SYSTEM SHALL 返回 422 与错误码 COUPON_EXPIRED。

#### Scenario: expired-but-not-flagged coupon rejected
- GIVEN 一张 expire_at 已过但 status 仍为 ACTIVE 的券
- WHEN 请求核销
- THEN 返回 422，body.code == COUPON_EXPIRED
```

**这一步的价值**：修复的预期行为被固化成规格和场景，而不是只存在于 hotfix commit message 里。

### 3. apply + 快速验证

事故场景下李工选择留在 Cursor 会话里盯着做（`/hx-apply hotfix-expired-coupon-500`，agent 先补红测试再写修复，每步跑 fast-lite 套件），也可以挂 headless 循环：

```console
$ hx apply hotfix-expired-coupon-500 --runner 'cursor-agent --task "$HX_TASK_TITLE"' --max-retries 2
completed tasks: 01a, 01b; remaining: 0
```

fast-lite 套件只有 `spec-validate` + 变更相关的单测（相关性启发式按 diff 依赖图选测试，见 NFR-001），全程 40 秒内。测试按 Scenario 命名，可追溯性不打折：

```typescript
it("Scenario: expired-but-not-flagged coupon rejected", async () => { ... });
```

### 4. archive --force 与发布

lite profile 没有 verify 阶段，change 到不了 `verified` 状态，所以 archive 需要显式 `--force`：

```console
$ hx archive hotfix-expired-coupon-500 --force
Archived to harnessX/archive/2026-07-04-hotfix-expired-coupon-500
Merged capabilities: coupon-redemption
```

`--force` 只跳过"必须 verified"这一个前置；**delta 合并、rebase 冲突检查、retro 生成一样不少**。19:25 发布，事故关闭。

### 5. 事后补账（48 小时内）

周一，李工按承诺开一条 standard change 补全面的规格与测试：

```console
$ hx change create expired-coupon-hardening --domains coupon-redemption
```

内容包括：把周五只覆盖了一个 Scenario 的需求扩展（并发核销竞态、批量核销中混入过期券等）、补齐 arch-boundary 检查发现的临时代码越层调用。

**谁来保证"事后补账"不被遗忘？** 两个机制兜底：

- 降级记录永远留在归档的 meta.yaml 里，月度审计脚本会列出所有 `overrideReason` 含"事后补"字样但没有后续 change 关联的条目；
- 若修复中加了 waiver（比如暂时豁免某个慢测试），waiver 会过期，`hx janitor run` 每晚在报告里催办（场景 07）。

## 关键机制解析

- **快速通道 ≠ 无政府**：lite 保留了三样最不能丢的东西——delta spec（行为固化）、Scenario→测试映射（可追溯）、archive 合并（主规格不失真）。省掉的是 design 文档、人工批准、重型验证套件。
- **`--force` 的边界**：它只放宽状态前置，不放宽 fail-closed。若 delta 格式错误或与主规格冲突，照样 BLOCKED。
- **降级留痕是文化工具**：没有人愿意自己的名字频繁出现在"核心域降级审计表"里。让正确的事情容易做、让偷懒的事情留痕，比禁止更有效。
