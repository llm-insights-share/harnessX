# 场景 07：AI 交付质量治理 —— 从重复失败到规则沉淀（Steering 循环）

## 背景

订单团队用 HarnessX 跑了六周，交付吞吐上去了，但技术负责人王工发现两个隐性成本：

1. agent 反复犯**同一类错**（比如在 service 层直接 `new Date()` 导致测试不稳定），每次都靠传感器拦下再重试——拦得住，但重试是有 token 和时间成本的；
2. 人工 code review 里反复出现**同一类意见**（"错误没有分类直接吞掉"），说明有些质量诉求还没变成机器规则。

Steering 循环的目标：**把这两类重复信号蒸馏成 harness 资产**——让下一次根本不犯，而不是每次都拦。

## 操作步骤

### 1. 看失败报表：谁在反复失败

```console
$ hx steer report
PATTERN 11x unit-changed::flaky time-dependent assertion in <file> expected <n> to be <n> (changes: partial-refund, refund-notify, order-split)
PATTERN 5x arch-boundary::layer "services" may not import layer "routes" (<file> -> <file>) (changes: order-split, bulk-cancel)
        2x lint::no-floating-promises in <file>
```

失败目录（`harnessX/runs/failure-catalog.jsonl`）由 Sensor Runner 自动累积，消息做了归一化（文件名/行号/哈希抹掉），所以"同一类错"能聚成一个 signature。**≥3 次标记为 PATTERN**，就是治理候选。

第一名很扎眼：时间相关的脆弱断言在 3 条 change 里累计失败 11 次。

### 2. 蒸馏成 Guide（前馈：让 agent 下次不犯）

```console
$ hx steer distill "flaky time-dependent" --kind guide.skill
draft asset written: harnessX/assets/guides/distilled-flaky-time-dependent-assertion-in-file
review and promote it via: hx asset promote <id> --to trial
```

生成的草稿自带证据链（provenance 指向失败模式签名 + 3 条来源 change），王工把 Guidance 一节改写成可执行的规则：

```markdown
## Guidance
- service 层禁止直接调用 `new Date()` / `Date.now()`；注入 `Clock` 接口，测试中使用 `FixedClock`。
- 断言时间字段时比较业务语义（如 `expiresInSeconds`），不比较绝对时间戳。
```

审阅后晋级 trial，并挂进 `harness.yaml` 的 apply 阶段 guides：

```console
$ hx asset promote harnessX/assets/guides/distilled-flaky-time-dependent-assertion-in-file --to trial
distilled-flaky-time-dependent-assertion-in-file → trial
```

从此 apply 阶段的 Context Pack 自动携带这条 Skill——**问题从"反馈拦截"前移到"前馈预防"**。

别忘了最后一步：重跑 `hx adapter sync`，新 Skill 才会编译进 `.cursor/skills/distilled-.../SKILL.md`（以及 Claude/Trae/Qoder 的对应位置）。此后 Cursor 用户不需要做任何事——agent 在 apply 阶段写测试时，这条"注入 Clock、不比较绝对时间戳"的规范会作为 Skill 自动出现在其上下文里。验证方法很直接，在 Cursor 里问一句：

```text
Cursor ▸ 给优惠券过期逻辑写个测试
Agent  ▸ （按 Skill 使用 FixedClock 注入而非 new Date()，断言 expiresInSeconds
          而非绝对时间戳）
```

### 3. 收割人工 review 意见 → Rubric 规则（反馈：机器替人盯）

导出最近 30 天 PR review 意见（`gh api` 拼一个 `[{pr, author, body}]` 的 JSON），交给收割器聚类：

```console
$ hx steer harvest-pr --from /tmp/review-comments.json
draft rubric rule rule-001 (topic: error-handling, 9 comments) → harnessX/assets/rubrics/team-review/rules.yaml
draft rubric rule rule-002 (topic: naming, 4 comments) → harnessX/assets/rubrics/team-review/rules.yaml
```

9 条意见聚在 error-handling——就是"错误直接吞掉"那个顽疾。王工把草稿细化成可判定的规则（给启发式 judge 补 pattern，没有 pattern 的规则交给 LLM judge，见下）：

```yaml
rules:
  - id: rule-001
    status: trial          # 先试运行，只报 info 不阻断
    check: catch 块不得静默吞错：必须分类重抛（DomainError）或带上下文记录日志
    pattern: "catch\\s*(\\([^)]*\\))?\\s*\\{\\s*\\}"
    severity: block        # 晋级 enforced 后才生效为 block
```

日常也可以随手沉淀口语化检查项：

```console
$ hx rubric add "退款相关代码必须打印带 orderId 的结构化日志" --pattern "refund(?![\\s\\S]{0,200}orderId)" --severity warn
added rule-003 (draft) to harnessX/assets/rubrics/team-review/rules.yaml
```

需要语义级判断的规则，接一个本地 LLM judge（脱敏中间件会先把疑似密钥替换为 `[REDACTED]`，`budget_tokens` 限制送审内容量）：

```console
$ export HX_JUDGE_CMD="ollama-judge --model qwen3"      # stdin: {rule, content} → stdout: {violation, note}
$ hx verify order-split      # verification 套件中的 ai-spec-review 即走该 judge
```

### 4. 用数据决定规则的生死（trial → enforced / 退役）

trial 期间规则只产生 info 级 finding。评审时把误报喂回去：

```console
$ hx rubric feedback harnessX/assets/rubrics/team-review/rules.yaml rule-001 --false-positive
rule-001: 1/12 false positives (8%)
```

两周后数据说话——12 次评估、误报 8%，低于 20% 阈值，允许晋级：

```console
$ hx asset promote harnessX/assets/rubrics/team-review --to enforced
team-review → enforced
```

反之，`rule-002`（naming）误报率 45%，证明"命名"这种事写不成可判定规则，直接改 `status: deprecated` 退役——**规则库靠数据新陈代谢，不靠谁嗓门大**。

### 5. janitor：每晚巡检兜底

CI cron（`hx schedule run` 同一调度入口）每晚执行：

```console
$ hx janitor run
expired waivers: 2
drift findings: 3
dead assets: 1
report (PR-body ready): harnessX/runs/janitor-report.md
```

报告是现成的 PR 正文（checkbox 列表）：过期 waiver 催办（场景 03 里那个银行沙箱豁免到期了）、spec/code 漂移、以及从没被任何套件引用过的死传感器。值周同学基于报告开清理 PR。

### 6. 季度复盘：覆盖率报表

```console
$ hx steer coverage
sensor runs: 1847
first-attempt pass rate: 78.3%
recurrent patterns (>=3): 4, uncovered: 1
  11x unit-changed::flaky time-dependent ... — covered by: distilled-flaky-time-dependent-assertion-in-file
  5x arch-boundary::layer "services" ... — covered by: layering-rules
  3x lint::unused-import ... — covered by: (nothing)
```

`covered by: (nothing)` 的复发模式就是下季度的治理清单；first-attempt pass rate 的走势则回答"harness 到底有没有让 agent 变得更省心"。

## 关键机制解析

- **拦截是成本，预防是资产**：传感器每拦一次都消耗重试预算。Steering 的本质是把高频拦截转化为 Guide（前馈），把高频人工意见转化为 Rubric（自动反馈），双向压缩重复成本。
- **证据链让治理可信**：蒸馏资产的 provenance 记录了它来自哪个失败模式、哪些 change、哪些 PR 意见。半年后有人问"这条规则凭什么存在"，答案是可追溯的数据而不是"当时某人觉得"。
- **trial 生命周期是防官僚的关键**：规则先试运行、误报计数、达标才 enforced、超标就退役。没有这个闸门，规则库只会单调膨胀成没人遵守的"祖训"。
