# Sensor 机制与各 Kind 配置指南

**适用角色**：平台组、Tech Lead、质量负责人、安全/合规团队  
**适用阶段**：`req` / `arch` / `dev` / `test` 各阶段；主要在 gate / verify / watch / schedule 触发  
**版本**：HarnessX v0.6+  
**关联文档**：[操作说明](operation-guide.zh-CN.md) · [Rubric 编写与维护使用手册](rubric-manual.zh-CN.md) · [场景 10 自定义传感器与触发器](examples/10-自定义传感器与触发器.md) · [系统设计](harness-delivery-system-design.html)

---

## 1. 概述

在 HarnessX（`hx`）中，**Sensor 是「反馈资产」**（`sensor.*`）：在交付流程的特定 `stage` / `task` 节点自动执行检查，输出统一的 `SensorReport`，驱动 gate 通过或阻断。

```text
harness.yaml 注册 sensors + suites
        ↓
hx gate check / hx verify / hx watch / hx schedule run
        ↓
sensorRunner 按 def 选择执行方式（builtin / run / plugin）
        ↓
SensorReport（pass | fail | error）
        ↓
Suite 聚合 blockers / warnings → gate 决策
```

**与 Guide 的分工：**

| 类型 | 时机 | 目的 |
| --- | --- | --- |
| **Guide**（`guide.*`） | apply 前馈 | 让 Agent **下次写对** |
| **Sensor**（`sensor.*`） | verify / 保存 / 定时 | 机器 **检查已写内容** |

经验法则：**拦截是成本，预防是资产**——高频人工 review 意见应蒸馏为 Rubric（`sensor.rubric`），高频 Agent 错误应蒸馏为 Skill（`guide.skill`）。详见 [场景 07 Steering 质量治理](examples/07-steering-质量治理.md)。

---

## 2. 通用配置模型

所有 Sensor 在 `harnessX/harness.yaml` 的 `sensors[]` 中注册，共享 `SensorDef` 结构（`packages/core/src/schemas.ts`）。

### 2.1 完整字段说明

```yaml
sensors:
  - id: my-sensor              # 唯一 ID，suites 中引用
    kind: sensor.script        # 见 §3
    execution: computational   # computational | inferential
    stage: dev                 # 可选：req | arch | dev | test
    task: verify               # 可选：propose | design | apply | verify ...
    trigger: task              # task（默认）| file-save | schedule
    scope: ["config/**"]       # 仅 trigger: file-save 时生效
    builtin: lint              # 三选一 ↓
    run: "npm run lint"        # shell 命令
    plugin: "cmd:python3 ..."  # 插件（Node 模块或 cmd: 协议）
    on_fail: block             # block | warn | retry
    max_retries: 0             # on_fail: retry 时生效
    fix_hint: "修复说明"
    budget_tokens: 8000        # 仅 inferential（rubric）常用
    timeout_ms: 120000         # 默认 120s
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 传感器唯一标识 |
| `kind` | 是 | 资产类型，决定语义分类（见 §3） |
| `execution` | 是 | `computational`（确定性）或 `inferential`（LLM/Judge） |
| `stage` / `task` | 否 | 标注适用交付节点；实际执行由 profile 的 `suites` 映射决定 |
| `trigger` | 否 | 默认 `task`；`file-save` 配合 `hx watch`；`schedule` 配合 `hx schedule run` |
| `scope` | 否 | `file-save` 时限定 glob，节省资源 |
| `builtin` / `run` / `plugin` | 三选一 | 指定执行方式（§2.2） |
| `on_fail` | 否 | 默认 `block` |
| `fix_hint` | 否 | 失败时写入报告，供 `hx fix` 组装 Context Pack |
| `budget_tokens` | 否 | Rubric 送审内容 token 上限 |
| `timeout_ms` | 否 | 默认 120000ms |

### 2.2 三种执行方式

| 字段 | 说明 |
| --- | --- |
| `builtin` | 引用内置传感器（如 `spec-trace`、`rubric`、`fixture-hash`） |
| `run` | Shell 命令；支持 `$CHANGE` 占位符；exit 0 = pass |
| `plugin` | Node ES 模块，或 `cmd:<命令>`（stdin JSON → stdout JSON） |

### 2.3 三种触发时机

| `trigger` | 场景 | 命令 |
| --- | --- | --- |
| `task` | gate / verify 阶段 | `hx gate check`、`hx verify` |
| `file-save` | 保存即扫 | `hx watch`（配合 `scope` glob） |
| `schedule` | 定时巡检 | `hx schedule run` |

### 2.4 失败语义（fail-closed）

- `status: error`（崩溃、超时、JSON 无法解析）→ **一律阻断**
- `on_fail: block` → fail 计入 blockers
- `on_fail: warn` → fail 降级为 warnings（gate 可通过）
- `on_fail: retry` → 最多重试 `max_retries` 次
- 有效 waiver → 失败降级为 `(waived)` 警告

### 2.5 结构化输出（`SensorReport`）

```json
{
  "sensor": "secscan",
  "status": "fail",
  "summary": "3 secret-like finding(s)",
  "findings": [
    {
      "severity": "block",
      "file": "config/redis.yaml",
      "line": 12,
      "rule": "hardcoded-secret",
      "message": "password in plain text",
      "fix_hint": "改用环境变量"
    }
  ],
  "fix_hint": "全局修复提示",
  "fix_command": "hx fix --change my-change --sensor secscan",
  "agent_instruction": "给 Agent 的纪律说明"
}
```

Shell / 插件传感器：stdout 含 JSON 行则解析为报告；否则 exit 0 = pass，非 0 = fail。

### 2.6 套件与 Profile 映射

```yaml
profiles:
  standard:
    stages: [req, arch, dev, test]
    dev_tasks: [plan, propose, design, apply, verify, archive]
    suites:
      dev.apply: fast
      dev.verify: verification

suites:
  fast:
    - spec-validate
    - typecheck
    - lint
    - unit-changed
  verification:
    - spec-validate
    - spec-trace
    - drift
  verification-strict:
    - spec-validate
    - spec-trace
    - unit-changed
    - mutation-probe
    - ai-spec-review
```

执行：`hx gate check <change>` 根据当前 `stage`/`task` 解析套件名，依次运行套件中的 sensor id 列表。

---

## 3. 全部 Sensor Kind 对比

HarnessX 当前注册的 `SENSOR_KINDS`（`packages/core/src/schemas.ts`）：

```text
sensor.rule | sensor.script | sensor.arch | sensor.rubric
sensor.fixture | sensor.budget | sensor.drift | sensor.mutation | sensor.eval
```

| Kind | 语义定位 | `execution` | 典型实现 | 配置重点 |
| --- | --- | --- | --- | --- |
| **`sensor.rule`** | Lint / 静态规则 | `computational` | `run: npm run lint` | 命令 + `fix_hint` |
| **`sensor.script`** | 通用计算型传感器 | `computational` | `builtin` / `run` / `plugin` | 最灵活，承载大部分内置逻辑 |
| **`sensor.arch`** | 架构边界 / 分层 | `computational` | `builtin: arch-boundary` | 配对 `guide.constraint` |
| **`sensor.rubric`** | AI 推断型评审 | `inferential` | `builtin: rubric` | `rules.yaml` + Judge |
| **`sensor.fixture`** | 已批准测试资产守护 | `computational` | `builtin: fixture-hash` | `fixtures.lock` + file-save |
| **`sensor.budget`** | 性能 / 体量预算 | `computational` | `builtin: budget` | `guide.constraint` 中 `budgets` |
| **`sensor.drift`** | 规格↔代码 / 设计↔代码漂移 | `computational` | `builtin: drift` | 通常 `on_fail: warn` |
| **`sensor.mutation`** | 测试强度 / 变异探测 | `computational` | `builtin: mutation-probe` | strict profile 套件 |
| **`sensor.eval`** | Rubric/Judge 评估集 | `computational` | **规划中，尚无内置执行器** | Hub eval 闭环预留 |

> **实践说明**：`sensor.rule` 与 `sensor.script` 执行路径相同，区别主要是**语义标注**（rule = 静态 lint，script = 通用脚本）。内置传感器（`spec-validate`、`typecheck` 等）在 bundle 中普遍标注为 `sensor.script`。

---

## 4. `sensor.script` — 通用计算型传感器

### 4.1 适用场景

- 内置检查：`spec-validate`、`spec-trace`、`typecheck`、`lint`、`unit-changed`、`prd-complete` 等
- 自定义 Shell：`run: "npm test"`
- 自定义插件：安全扫描、合规检查、集成测试

### 4.2 内置传感器一览（节选）

| `builtin` | 功能 |
| --- | --- |
| `spec-validate` | delta spec 格式 / EARS 校验 |
| `spec-trace` | 场景→测试追溯 |
| `typecheck` / `lint` / `unit-changed` | 快速反馈套件 |
| `requirements-complete` / `design-*` | 交付制品完整性 |
| `prd-complete` / `arch-*` | 组织级 PRD/架构门禁 |
| `integration-smoke` | 运行 `npm run test:integration` |
| `approved-tests` | 已批准测试不可被 Agent 篡改 |

完整列表见 `packages/sensors/src/index.ts` 中的 `builtinSensors`。

### 4.3 配置示例

**A. 内置传感器**

```yaml
- id: spec-trace
  kind: sensor.script
  execution: computational
  builtin: spec-trace
  on_fail: block
  stage: dev
  task: verify
```

**B. Shell 命令**

```yaml
- id: eslint
  kind: sensor.rule          # 或 sensor.script，执行无差别
  execution: computational
  run: "npm run lint"
  on_fail: block
  fix_hint: "修复 ESLint 报错"
  timeout_ms: 60000
```

**C. Python 插件（`cmd:` 协议）**

```yaml
- id: secscan
  kind: sensor.script
  execution: computational
  stage: dev
  task: verify
  plugin: "cmd:python3 harnessX/plugins/secscan_adapter.py"
  on_fail: block
  fix_hint: "移除硬编码密钥"
  timeout_ms: 180000
```

插件 stdin 上下文：

```json
{
  "root": "/repo",
  "base": "/repo/harnessX",
  "change": "fee-recalc",
  "sensor": { "id": "secscan", "kind": "sensor.script", "execution": "computational" }
}
```

**D. 保存即扫（file-save）**

```yaml
- id: secscan-hot
  kind: sensor.script
  execution: computational
  trigger: file-save
  scope: ["config/**", "**/*.env.example"]
  plugin: "cmd:python3 harnessX/plugins/secscan_adapter.py"
  on_fail: block
```

```bash
hx watch   # 本地守护
```

**E. Node 插件模块**

```javascript
// harnessX/plugins/my-sensor.mjs
export default {
  api: "1.0.0",
  id: "my-sensor",
  async execute(ctx) {
    return { status: "pass", summary: "ok", findings: [] };
  }
};
```

```yaml
plugin: plugins/my-sensor.mjs
```

### 4.4 修复回环

传感器报告中的 `fix_command` 可驱动定向修复：

```bash
hx fix --change <change> --sensor <sensor-id>
# 生成 harnessX/changes/<change>/fix-pack.md
```

详见 [场景 10 自定义传感器与触发器](examples/10-自定义传感器与触发器.md)。

---

## 5. `sensor.rubric` — 推断型 AI 评审

> Rubric 的编写、生命周期与按阶段规则建议，详见 **[Rubric 编写与维护使用手册](rubric-manual.zh-CN.md)**。本节聚焦 harness 侧配置。

### 5.1 机制

- **Rubric as Data**：规则存于 `harnessX/assets/rubrics/*/rules.yaml`
- 内置执行器 `builtin: rubric`（传感器 ID 常为 `ai-spec-review`）
- 评估内容：`proposal.md` + 本 change 全部 delta spec（**不自动读** `docs/prd/`、`design/`）
- Judge 模式：
  - 默认：启发式（有 `pattern` 则正则匹配）
  - `export HX_JUDGE_CMD="..."`：外部 LLM Judge（stdin/stdout JSON）

### 5.2 `rules.yaml` 格式

```yaml
rules:
  - id: spec-ambiguous
    status: enforced          # draft | trial | enforced | deprecated
    check: 避免模糊措辞
    pattern: "\\b(maybe|probably)\\b"   # 可选；无 pattern 需 LLM Judge
    severity: warn            # block | warn | info
    falsePositives: 0
    evaluations: 0
```

**规则生命周期：**

| `status` | 参与评估 | 违规 severity |
| --- | --- | --- |
| `draft` | 否 | — |
| `trial` | 是 | 强制降为 `info`（观察期） |
| `enforced` | 是 | 使用声明的 severity |
| `deprecated` | 否 | — |

### 5.3 harness 配置

```yaml
- id: ai-spec-review
  kind: sensor.rubric
  execution: inferential
  builtin: rubric
  on_fail: warn              # strict/enterprise 中常用 warn，不阻断但留痕
  budget_tokens: 8000        # 送审内容 token 上限（脱敏后截断）
  stage: dev
  task: verify
```

### 5.4 Profile 与套件

| 套件 | Profile | 含 Rubric |
| --- | --- | --- |
| `verification` | standard | 否 |
| `verification-strict` | strict | 是（+ mutation-probe） |
| `verification-enterprise` | enterprise | 是 |

```bash
hx verify <change>
hx gate check <change> --stage dev --task verify
```

### 5.5 运维命令

```bash
hx rubric add --check "..." --pattern "..." --severity warn
hx rubric feedback <rule-id> --false-positive
hx steer distill "<signature>" --kind sensor.rubric
hxhub asset create --kind sensor.rubric --id team-review
```

> Hub 安装的 rubric（`.hub-cache/`）**不会自动生效**，须复制到 `assets/rubrics/` 或通过 `hx hub add` 合并进 harness。

---

## 6. `sensor.fixture` — 已批准 Fixture 守护

### 6.1 机制（双层守护）

1. **L2 平台只读**：`hx adapter sync` 后，编辑器 hooks 拦截 Agent 修改受保护 fixture
2. **L3 哈希校验**：`fixture-hash` 传感器对比 `fixtures.lock` 中的内容哈希

人类批准 → 写入 lock → 后续任何未重新批准的修改 → **阻断**。

### 6.2 配置

```yaml
- id: fixture-guard
  kind: sensor.fixture
  execution: computational
  trigger: file-save          # 保存即校验；CI 中也可走 task 触发
  scope:
    - tests/fixtures/**
  builtin: fixture-hash
  on_fail: block
```

### 6.3 工作流

```bash
# 1. 创建并批准 golden fixture
echo '{"total": 42}' > tests/fixtures/expected.json
hx fixture approve tests/fixtures/expected.json --by alice

# 2. 校验
hx fixture verify

# 3. 若 Agent 擅自修改 → 传感器报 fail
# findings: approved fixture modified: tests/fixtures/expected.json

# 4. 合法更新需人工重新批准
hx fixture approve tests/fixtures/expected.json --by alice
```

`fixtures.lock` 结构（`harnessX/fixtures.lock`）：

```yaml
fixtures:
  tests/fixtures/expected.json:
    hash: a94b0e0dcfd4...
    approvedBy: alice
    at: "2026-07-13T09:00:00.000Z"
```

### 6.4 与 test-first 配合

strict profile 核心域场景：

```bash
hx testfirst generate <change>
# 人工编写断言
hx testfirst approve <change> --files tests/... --by qa-lead
```

已批准测试由 `approved-tests` 传感器（`sensor.script`）守护，fixture 由 `sensor.fixture` 守护——防止 Agent「改期望值让测试变绿」。详见 [场景 03 核心域改动](examples/03-核心域改动-strict-测试先行.md)。

---

## 7. `sensor.mutation` — 测试强度 / 变异探测

### 7.1 机制（lite 版）

内置 `builtin: mutation-probe` 对 change 映射到的场景测试做**静态启发式分析**（非完整 Stryker）：

| 检测项 | 说明 |
| --- | --- |
| FR-026 stub | `not implemented — FR-026` 占位测试 |
| 恒真断言 | `expect(true).toBe(true)` |
| 无断言 | 缺少 `expect` / `assert` |
| 浅断言 | 仅一条 expect 且文件很短 |

### 7.2 配置

```yaml
- id: mutation-probe
  kind: sensor.mutation
  execution: computational
  builtin: mutation-probe
  on_fail: block
  fix_hint: "加强场景测试断言，避免 stub 和恒真断言"
  stage: dev
  task: verify
```

### 7.3 纳入 strict 套件

```yaml
suites:
  verification-strict:
    - spec-validate
    - spec-trace
    - unit-changed
    - mutation-probe      # strict profile 专有
    - ai-spec-review
```

```bash
hx change create my-change --profile strict
```

> 设计文档指出：完整 Stryker 集成可在 strict profile 中替换此 lite 内置。

---

## 8. `sensor.drift` — 漂移探测

### 8.1 机制（三类漂移）

内置 `builtin: drift` 统一检测：

| 类型 | `rule` | 检测内容 |
| --- | --- | --- |
| spec↔code | `spec-code-drift` | 归档 spec 场景无对应测试 / 测试引用未声明场景 |
| design↔code | `design-code-drift` | `delivery-trace.yaml` 中 `code_hints` 指向的文件不存在 |
| adapter | `adapter-drift` | `.cursor/rules/harnessx.mdc` 等适配器文件被手改（哈希不匹配） |

默认 **全部为 warn**（不阻断 gate，但提示对齐）。

### 8.2 配置

```yaml
- id: drift
  kind: sensor.drift
  execution: computational
  builtin: drift
  on_fail: warn
  fix_hint: "运行 hx sync；修复 spec↔code 漂移；hx adapter sync 修复适配器漂移"
  stage: dev
  task: verify
```

### 8.3 修复命令

```bash
hx sync                    # 查看 spec↔code 漂移详情
hx adapter sync --targets cursor   # 恢复适配器生成文件
# 更新 delivery-trace code_hints 或补齐实现文件
```

### 8.4 与 janitor 联动

`hx janitor` 定时巡检也会调用 `syncCheck`，漂移数据可驱动自动清理 PR。

---

## 9. 其他 Kind 配置

### 9.1 `sensor.arch` — 架构边界

配对 `guide.constraint`（`layering.yaml`）：

```yaml
# guides
- id: layering-rules
  kind: guide.constraint
  execution: computational
  source: assets/bundles/api-service/constraints/layering.yaml
  stage: dev

# sensors
- id: arch-boundary
  kind: sensor.arch
  execution: computational
  builtin: arch-boundary
  on_fail: block
  fix_hint: "依赖应向内：routes → services → repositories"
  stage: dev
  task: verify
```

`layering.yaml` 示例（`packages/bundles/api-service/assets/constraints/layering.yaml`）：

```yaml
sourceRoots: [src]
layers:
  - name: routes
    path: src/routes
    mayImport: [services, shared]
  - name: services
    path: src/services
    mayImport: [repositories, shared]
forbidden:
  - from: src/repositories
    to: src/routes
    hint: "Repositories must not depend on the HTTP layer"
budgets:
  maxFileLines: 400
  maxBundleKB: 512
```

通过 `imports: [api-service]` 引入拓扑 Bundle 可自动获得 `arch-boundary` + `perf-budget` 传感器。

### 9.2 `sensor.budget` — 性能预算

```yaml
- id: perf-budget
  kind: sensor.budget
  execution: computational
  builtin: budget
  on_fail: warn
  stage: dev
  task: verify
```

读取同一 `guide.constraint` 中的 `budgets` 字段，检查单文件行数、源码总体积等。缺少 `guide.constraint` 时返回 `status: error`（fail-closed）。

### 9.3 `sensor.rule` vs `sensor.script`

```yaml
# 语义：静态 lint 规则
- id: eslint
  kind: sensor.rule
  execution: computational
  run: "npm run lint"
  on_fail: block

# 语义：通用脚本（内置/插件）
- id: typecheck
  kind: sensor.script
  execution: computational
  builtin: typecheck
  on_fail: block
```

两者执行引擎相同；选用哪个 kind 主要影响文档分类与 Hub 资产标注。

### 9.4 `sensor.eval`（预留）

设计定位为「传感器的传感器」——评估 Rubric/Judge 一致性与误报率。当前 schema 已注册，**尚无内置执行器**；Hub 侧通过 `hx hub eval` 做资产包验证。

---

## 10. 端到端配置清单

### 10.1 最小可运行 Sensor

```yaml
# harnessX/harness.yaml
version: "1.0"
imports: [api-service]        # 可选：引入拓扑 bundle 的 arch/budget 传感器

profiles:
  standard:
    stages: [req, arch, dev, test]
    dev_tasks: [plan, propose, design, apply, verify, archive]
    suites:
      dev.apply: fast
      dev.verify: verification

sensors:
  - id: team-lint
    kind: sensor.rule
    execution: computational
    run: "npm run lint"
    on_fail: block
    stage: dev
    task: apply

suites:
  fast:
    - team-lint
  verification:
    - spec-validate
    - spec-trace
    - drift
```

### 10.2 strict + fixture + mutation + rubric 全栈

```yaml
sensors:
  - id: fixture-guard
    kind: sensor.fixture
    execution: computational
    trigger: file-save
    scope: [tests/fixtures/**]
    builtin: fixture-hash
    on_fail: block

  - id: mutation-probe
    kind: sensor.mutation
    execution: computational
    builtin: mutation-probe
    on_fail: block
    stage: dev
    task: verify

  - id: ai-spec-review
    kind: sensor.rubric
    execution: inferential
    builtin: rubric
    on_fail: warn
    budget_tokens: 8000
    stage: dev
    task: verify

  - id: drift
    kind: sensor.drift
    execution: computational
    builtin: drift
    on_fail: warn
    stage: dev
    task: verify

profiles:
  strict:
    suites:
      dev.verify: verification-strict
```

### 10.3 验证命令

```bash
hx harness lint              # 检查 harness.yaml 合法性
hx gate check <change>       # 跑当前 stage/task 对应套件
hx verify <change>           # dev.verify 快捷入口
hx fixture verify            # 单独校验 fixture
hx sync                      # 查看漂移（与 drift 传感器同源）
hx watch                     # file-save 传感器守护
hx fix --change <c> --sensor <id>   # 生成修复 Context Pack
```

---

## 11. 选型速查

| 你想检查什么 | 推荐 Kind | 关键配置 |
| --- | --- | --- |
| ESLint / tsc / 单测 | `sensor.rule` / `sensor.script` | `run` 或 `builtin` |
| 自定义安全/合规扫描 | `sensor.script` | `plugin: cmd:...` |
| AI 评审规格质量 | `sensor.rubric` | `assets/rubrics/*/rules.yaml` |
| Golden fixture 不可篡改 | `sensor.fixture` | `fixture-hash` + `hx fixture approve` |
| 测试是否真能抓回归 | `sensor.mutation` | `mutation-probe`，strict 套件 |
| spec 与代码是否同步 | `sensor.drift` | `builtin: drift`，`on_fail: warn` |
| 分层依赖违规 | `sensor.arch` | `arch-boundary` + `guide.constraint` |
| 文件行数/体积超标 | `sensor.budget` | `budget` + `layering.yaml` 中 `budgets` |

---

## 12. 常见陷阱

1. **Rubric 不读 PRD/设计文档**——相关检查须在 delta spec / proposal 中体现，或由 script sensor 单独门禁。
2. **Hub rubric 未合并到 `assets/rubrics/`**——`ai-spec-review` 扫描不到 `.hub-cache`。
3. **fixture 未先 approve**——`fixtures.lock` 为空时 `fixture-hash` 永远 pass。
4. **插件无 JSON 输出**——fail-closed，gate 阻断。
5. **`sensor.arch` / `sensor.budget` 缺 `guide.constraint`**——返回 `status: error`（fail-closed）。
6. **`kind` 与 `execution` 不一致**——`sensor.rubric` 应为 `inferential`，其余一般为 `computational`。
7. **套件引用了未注册的 sensor id**——fail-closed，gate 报 `sensor not registered`。

---

## 13. 相关 CLI 命令索引

| 命令 | 说明 |
| --- | --- |
| `hx gate check <change>` | 执行当前 stage/task 对应 sensor 套件 |
| `hx verify <change>` | `dev.verify` 快捷入口 |
| `hx watch` | 启动 `file-save` 触发传感器守护 |
| `hx schedule run` | 执行 `trigger: schedule` 传感器 |
| `hx fixture approve/verify` | Fixture 批准与校验 |
| `hx testfirst generate/approve` | 测试先行工作流 |
| `hx sync` | 查看 spec↔code 漂移 |
| `hx adapter sync` | 恢复适配器生成文件 |
| `hx fix --change <c> --sensor <id>` | 生成修复 Context Pack |
| `hx waiver add` | 定向豁免传感器失败 |
| `hx harness lint` | 校验 harness.yaml |
| `hx steer distill --kind sensor.rubric` | 从失败模式蒸馏 Rubric |

完整命令表见 [操作说明](operation-guide.zh-CN.md)。
