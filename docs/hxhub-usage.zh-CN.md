# hxhub 使用手册（独立 Hub 运维 CLI）

`hxhub` 是面向 Hub 运维的独立命令，覆盖资产发布、贡献审核、资产脚手架、诊断与建议。  
`hx` 与 `hxhub` 长期并存：`hx` 偏交付流程，`hxhub` 偏 Hub 运维。

## 1. 定位与分工

| CLI | 主要定位 |
| --- | --- |
| `hx` | 项目交付流程 + 兼容 `hx hub` 入口 |
| `hxhub` | Hub 运维、资产创建、诊断（doctor）、建议（help） |

## 2. 快速开始

### 2.1 轻量初始化运维项目

```bash
hxhub init . --hub git@github.com:your-org/hx-hub.git --actor zhao.platform
```

`hxhub init` 仅创建运维最小集：
- `harnessX/config.yaml`
- `harnessX/roles.yaml`
- `.gitignore`（忽略 `harnessX/.hub-remotes/`、`harnessX/.hub-cache/`）
- `README.hxhub.md`

> 不会创建 `changes/`、`specs/`、`workorders/` 等交付目录（这点与 `hx init` 不同）。

### 2.2 首次检查

```bash
hxhub doctor --fix-hints
hxhub search --category package
```

## 3. 命令总览（当前实现）

### 3.1 Ops（运维）

- `hxhub golden`
- `hxhub seed [path] [--submit --remote --branch --message]`
- `hxhub add <id@version>`
- `hxhub sync [--apply --force --only ... --offline --refresh]`
- `hxhub promote <dir> --by <name> [--evidence --skip-policy --skip-eval]`
- `hxhub submit <dir> [--actor --evidence --skip-eval]`
- `hxhub push [--message --branch]`
- `hxhub search [query] [--kind --phase --category --index]`
- `hxhub catalog rebuild`
- `hxhub eval <id@version> [--local --golden --list --out]`
- `hxhub policy check [--strict]`
- `hxhub cache-gc [--older-than-days]`

### 3.2 Contributions（贡献审核）

- `hxhub contributions list [--status pending|approved|rejected] [--actor]`
- `hxhub contributions show <ref>`
- `hxhub contributions accept <ref> --reviewer <name>`
- `hxhub contributions reject <ref> --reviewer <name> --reason <text>`

### 3.3 Asset（资产生命周期 + 脚手架）

- `hxhub asset create [--interactive]`
- `hxhub asset info <id@version>`
- `hxhub asset promote <id@version> --to <status>`
- `hxhub asset deprecate <id@version> --reason <text>`

### 3.4 Review（评审）

- `hxhub review request <id@version> --by <name>`
- `hxhub review approve <id@version> --reviewer <name>`
- `hxhub review reject <id@version> --reviewer <name> --reason <text>`

### 3.5 智能辅助

- `hxhub help [general|api|enterprise] [--json]`
- `hxhub doctor [--json] [--fix-hints]`

## 4. 资产创建（新增）

### 4.1 非交互创建

```bash
hxhub asset create \
  --kind guide.skill \
  --id idempotency-keys \
  --asset-version 1.0.0 \
  --status draft \
  --phase apply,verify \
  --source-dir ./harnessX/assets/guides/idempotency-keys \
  --out ./assets/idempotency-keys
```

> 注意：参数是 `--asset-version`（不是 `--version`）。
> 可通过 `--source-dir` 指定创建资产所需原文件所在目录（如已有 `SKILL.md` / `template.md` / `rules.yaml` 目录）。

### 4.2 交互创建

```bash
hxhub asset create --interactive
```

交互模式也会询问 `source directory`，也可直接传 `--source-dir <dir>` 预填。

自动生成 `asset.yaml` 与 kind 对应模板：
- `guide.skill` -> `SKILL.md`
- `guide.template` -> `template.md`
- `sensor.rubric` -> `rules.yaml`
- `harness.bundle` -> `bundle.yaml` + `assets/`
- `harness.blueprint` -> `blueprint.yaml`

## 5. AI 建议与 Doctor 诊断

### 5.1 建议（help）

```bash
hxhub help general
hxhub help api --json
```

输出包含：
- 推荐资产
- 推荐原因
- 下一步命令建议

### 5.2 诊断（doctor）

```bash
hxhub doctor
hxhub doctor --json
hxhub doctor --fix-hints
```

当前诊断范围：
- Hub 连接解析与角色配置
- `hub-policy.yaml` maintainer/审批门禁
- 治理规则问题（来自 policy/governance）
- contributions pending 积压
- eval 集缺失
- 本地远端镜像缓存状态提示

## 6. 典型 Maintainer 流程

```bash
# 1) 生成资产
hxhub asset create --interactive

# 2) 发布并评审
hxhub promote ./assets/my-skill --by zhao.platform --evidence "ci://runs/1820"
hxhub review approve my-skill@1.0.0 --reviewer zhao.platform
hxhub asset promote my-skill@1.0.0 --to enforced

# 3) 提交远端
hxhub push --message "publish: my-skill@1.0.0"
```

## 7. 与 hx hub 的关系

- `hx hub ...` 继续可用（兼容入口）。
- 新运维项目建议优先使用 `hxhub`。
- 已有项目可渐进迁移，不要求一次性切换。
