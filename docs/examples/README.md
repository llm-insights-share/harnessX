# HarnessX 使用场景示例

**English**: [Usage scenario examples (English)](en/README.md)

本目录收录一组贴近实际工作的端到端场景。每个场景包含：**背景与角色**、**逐步操作命令与期望输出**、**关键机制解析**。命令输出均与 `hx` CLI 实际行为一致，可以照着在真实仓库中复现。

| # | 场景 | 主要覆盖能力 |
| --- | --- | --- |
| [01](01-新项目接入.md) | 新的后端 API 项目接入 HarnessX | `init --bundle` / hooks / CI 重放 / adapter 编译 |
| [02](02-标准功能开发全流程.md) | 订单服务新增"部分退款"功能（standard profile） | propose→design→spec→人工批准→plan→apply 自校正→verify→archive |
| [03](03-核心域改动-strict-测试先行.md) | 支付核心域改动，strict profile + 测试先行 | profile 推荐 / testfirst / 已批准断言保护 / waiver |
| [04](04-并发变更冲突.md) | 两个团队同时修改同一 capability | 域重叠告警 / rebase check / 冲突解决 |
| [05](05-紧急修复-lite.md) | 线上 bug 紧急修复走 lite 快速通道 | profile 降级记录 / `archive --force` / 事后补账 |
| [06](06-遗留项目迁移-openspec.md) | 存量 OpenSpec 项目迁移 + 遗留代码补 spec | `openspec import` / `sync` 漂移检测 / 回写规格 |
| [07](07-steering-质量治理.md) | AI 交付质量治理：从重复失败到规则沉淀 | 失败目录 / `steer distill` / rubric 生命周期 / janitor |
| [08](08-hub-资产共享与供应链.md) | 平台团队通过 Hub 向业务仓库分发规范资产 | hub promote/review/add/sync / lock / 注入扫描 |
| [09](09-多工具协作与CI强制.md) | 团队成员分别使用 Cursor/Trae/Qoder/Claude Code | adapter 单源编译 / 手改漂移检测 / Quest 导出 / 绕过 hooks 被 CI 拦截 |
| [10](10-自定义传感器与触发器.md) | 安全团队接入自研扫描器 + 事件/定时触发 | 插件 API（Node/命令协议）/ file-save 触发 / schedule / `hx fix` |
| [11](11-自定义需求产出模板.md) | 开工前定制 proposal 模板与 delta spec 写作规范 | `guide.template` / spec-writing Skill / Gate 强制节 / `overrides` |
| [12](12-自定义概要设计产出模板.md) | 开工前定制 design.md 结构与 design 阶段命令 | design-template 资产 / 定制 `/hx-design` / api-design Skill / Context Pack |

## 阅读前提

- 已按仓库根目录 `README.md` 完成 `npm install`；示例中以 `hx` 代指 `node bin/hx.js`（或全局安装后的 `hx`）。
- 示例中的人名（王工、李工、张架构师等）与业务（订单、支付、库存）均为虚构，用于说明角色分工：**谁写规格、谁批准、谁实现、谁审核**。

## 两类操作入口

示例中的操作分两类，注意区分：

1. **终端命令**（`$ hx ...` 的 console 代码块）：直接在 shell 里执行，通常是仓库管理、gate 推进、人工批准这类"管控面"动作。
2. **Cursor 对话框操作**（标注为 `Cursor ▸` 的代码块）：在 Cursor 的 Agent 对话框里输入，驱动 agent 干活。前提是已跑过 `hx adapter sync`（场景 01），此时：
   - 输入 `/` 可以看到 `hx-explore`、`hx-propose` … `hx-archive` 八个斜杠命令，**每个命令的正文是该阶段的完整工作流提示词**（步骤、护栏、完成标准），agent 会照着执行并自己调用 `hx` CLI 自检；
   - `.cursor/rules/harnessx.mdc`（`alwaysApply: true`）让 agent 在**每一次**对话中都带着宪法与 HarnessX 纪律（不许手改 meta.yaml/fixtures、失败先读 fix_hint 等）；
   - `.cursor/skills/*/SKILL.md`（编码规范、EARS 规格写作等）由 Cursor 按相关性自动挂载；
   - `.cursor/hooks.json` 在提交提示前自动跑 `hx gate hook-check`、在编辑 fixtures/meta.yaml 后自动跑 `hx fixture verify`（L2 强制）。

  其他工具（Trae/Qoder/Claude Code）的等价入口见场景 09；本目录默认以 Cursor 为例。

一条常用的经验法则：**agent 能自己做的（写提案、写规格、写代码、修失败）走 Cursor 对话框；只有人才能做的（批准、豁免、发布评审）走终端命令**——后者也是审计留痕的落点。

## 核心心智模型（1 分钟版）

1. 一切行为改动都在 **change 工作区**（`harnessX/changes/<id>/`）内进行，通过 delta spec 描述"规格的增量"。
2. 阶段推进靠 **Gate**：`hx gate advance` 只在该阶段 Sensor 套件全绿、且满足前置条件（如人工批准）时才放行；Sensor 崩溃视为阻断（fail-closed）。
3. AI agent 的输入由 **Guide/Context Pack** 组装（`hx guide pack`），输出由 **Sensor** 检验；失败报告带 `fix_hint`/`fix_command`，可直接进入修复回环（`hx fix`）。
4. 交付完成后 `hx archive` 把 delta 合并进主规格，主规格永远是"当前系统行为"的唯一事实源。
5. 反复出现的失败通过 **Steering** 蒸馏成新的 Guide/Rubric 资产，经 trial 验证后晋级 enforced，再经 **Hub** 共享到其他仓库——harness 自身持续进化。
