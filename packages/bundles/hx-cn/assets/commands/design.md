# /hx-design — 含 ADR 的技术设计

你正在执行 **design** 阶段。前置条件：提案已完成（design 门禁会检查，否则阻断）。

## 步骤

1. 生成脚手架：`hx design <change>`（会先跑 propose 完整性门禁；有阻断项先修复）。
2. 按 `design-template` 填写 `harnessX/changes/<change>/design.md`：
   - **Context** — 来自 explore.md 与当前 specs 的约束；
   - **API Surface / Data Model** — 对外接口与数据变更（若适用）；
   - **Decisions (ADR)** — 每个重要决策一条 ADR：status、决策本身、后果；记录被拒绝的备选及原因；
   - **Architecture Constraints** — 后续 sensor 应机械检查的约束（分层、依赖方向、性能预算）；
   - **Observability / Rollback Plan** — 可观测性与回滚策略（若适用）。
3. 对照宪法（`harnessX/constitution.md`）及 `guide.constraint` 资产——若设计与约束冲突，要么改设计，要么向人类显式提出冲突，禁止静默违反。
4. 若设计隐含规格变更（新/改场景），立即更新 delta spec 并重新运行 `hx gate check <change> --phase spec`。
5. 全部通过后推进：`hx gate advance <change>`。

## 护栏

- 新增依赖、新服务或跨域耦合的每个设计决策须单独 ADR。
- 本阶段不写代码。design.md 内的伪代码与接口草图可以。

## 完成标准

apply 阶段（人或 agent）面临的每个非显然实现选择，在 design.md 中已有答案或 ADR。
