# /hx-archive — 合并 delta 至主规格并关闭 change

你正在执行 **archive** 阶段。将 change 的 delta spec 合并入 `harnessX/specs/`（活规格），并将 change 移至 `harnessX/archive/`。

## 步骤

1. 预检：`hx rebase check <change>`。若其他 change 先归档且你的 MODIFIED/REMOVED 不再匹配当前主规格，更新 delta 条目；若 spec 批准失效，须人类重新批准。
2. Enterprise：`hx arch promote <change>` — 将 design 沉淀到 `docs/architecture/modules/*/lld.md`（archive 前必需，除非豁免）。
3. 归档：`hx archive <change>`。将：
   - 把 ADDED/MODIFIED/REMOVED 合并入主 capability 规格；
   - 写入 `retro.md`，汇总门禁历史、豁免与 sensor 失败（供 steering 循环使用）；
   - 将 change 目录移入 `harnessX/archive/`。
3. 审阅生成的 retro.md。若本 change 中同一 sensor 失败 3 次以上，记录之——`hx steer report` 会将其列为新 guide 或 sensor 候选。
4. 将归档作为独立 commit 提交，保持规格历史可审计。

## 护栏

- 禁止直接手改 `harnessX/specs/` 以「帮助」合并；仅 archive 合并写入主规格。
- 若合并报告冲突，在 **delta spec** 中解决，不要在主规格中解决。

## 完成标准

change 位于 `harnessX/archive/`，主规格反映新行为，`hx status` 不再将其列为活跃 change。
