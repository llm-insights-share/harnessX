# Skill: PRD 蒸馏（组织 PRD → Harness 制品）

从组织 PRD 落到 Harness 制品时：

1. 写 `proposal.md` 前先阅读 `docs/prd/<feature>.md`（或用户 `@` 引用的文档）。
2. 将每条 PRD 验收标准（AC）映射到**恰好一条** delta spec `Requirement`（在 `delivery-trace.yaml` 中记录 AC id）。
3. 产品叙事放在 `requirements/prd-summary.md` 与 `requirements/user-stories.md`。
4. 非功能需求（延迟、安全、合规等）放在 `requirements/nfr.md`，可度量的部分同步进 delta spec。
5. 不得臆造 PRD 未列出的需求——列入 Out of Scope 或 Open Questions。
6. PRD 中提到的 UI 页面须在 design 阶段出现在 `design/ui/pages.md`。
